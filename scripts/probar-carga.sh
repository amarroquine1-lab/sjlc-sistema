#!/usr/bin/env bash
# Prueba de carga ligera: 20 sesiones simultáneas contra el proyecto sjlc-pruebas con los límites de memoria del VPS de producción.
# Uso: ./scripts/probar-carga.sh [segundos]   (por omisión 60)
# Levanta y siembra sjlc-pruebas, aplica límites de memoria a sus contenedores, corre la carga desde un contenedor temporal de Node
# y al terminar apaga y borra solo ese proyecto. No se instala nada en el servidor.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno ""
: "${PRUEBAS_CONTRASENA:?Falta PRUEBAS_CONTRASENA en .env}"
[ "$ENTORNO" != produccion ] || { echo "Error: no corre con ENTORNO=produccion" >&2; exit 1; }
PRU=(-p sjlc-pruebas -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.pruebas.yml)
limpiar() { docker compose "${PRU[@]}" down -v --remove-orphans > /dev/null 2>&1 || true; }
confirmar_borrar_pruebas || exit 1
trap limpiar EXIT
DURACION="${1:-60}"

echo "Levantando sjlc-pruebas…"
docker compose "${PRU[@]}" up -d --build --wait bd > /dev/null 2>&1 || { echo "No levantó bd" >&2; exit 1; }
./scripts/migrar.sh sjlc-pruebas > /dev/null 2>&1 && ./scripts/sembrar.sh produccion sjlc-pruebas > /dev/null 2>&1 \
  && ./scripts/sembrar.sh pruebas sjlc-pruebas > /dev/null 2>&1 || { echo "Falló la migración o la siembra" >&2; exit 1; }
docker compose "${PRU[@]}" up -d --build --wait backend web > /tmp/carga-up.log 2>&1 || { tail -5 /tmp/carga-up.log >&2; exit 1; }

# Límites parecidos al VPS de producción (1 vCPU, 1,9 GB en total, con el sistema operativo y el swap aparte)
for s in bd:700m backend:400m web:100m; do
  id=$(docker compose "${PRU[@]}" ps -q "${s%%:*}")
  docker update --memory "${s##*:}" --memory-swap "${s##*:}" --cpus 1 "$id" > /dev/null
done
echo "Límites aplicados: bd 700m, backend 400m, web 100m, 1 CPU cada uno"

( for _ in $(seq 1 $((DURACION / 5 + 2))); do
    docker stats --no-stream --format '{{.Name}} {{.MemUsage}} {{.CPUPerc}}' $(docker compose "${PRU[@]}" ps -q) 2>/dev/null >> /tmp/carga-stats.log; sleep 5
  done ) &
: > /tmp/carga-stats.log
docker run --rm --network host -e URL_BASE=http://localhost:18080 -e PRUEBAS_CONTRASENA -e DURACION="$DURACION" \
  -v "$PWD/e2e/carga:/carga:ro" node:22.23-alpine node /carga/carga.mjs
codigo=$?
wait
echo; echo "Memoria y CPU (máximos observados por contenedor):"
awk '{n=$1; split($2,a,"MiB"); m=a[1]+0; c=$NF; sub("%","",c); if (m>mm[n]) mm[n]=m; if (c+0>cc[n]) cc[n]=c+0} END {for (n in mm) printf "  %s: %.0f MiB, CPU %.0f %%\n", n, mm[n], cc[n]}' /tmp/carga-stats.log
docker compose "${PRU[@]}" ps -a --format '{{.Name}} {{.Status}}' | grep -v "Up" && echo "ATENCIÓN: algún contenedor no está en marcha" || true
if [ $codigo -ne 0 ]; then
  echo; echo "Registros del backend con errores (últimos):"
  docker compose "${PRU[@]}" logs --no-log-prefix backend 2>&1 | grep -iE '"level":(50|60)|503|error' | tail -5 | cut -c1-300
  echo "Registros de web con 503 (últimos):"
  docker compose "${PRU[@]}" logs --no-log-prefix web 2>&1 | grep -E ' 503 |error' | tail -5 | cut -c1-300
fi
exit $codigo

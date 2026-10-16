#!/usr/bin/env bash
# Pruebas de punta a punta con Playwright (escritorio 1366×768 y tablet) contra el sistema completo.
# Uso: ./scripts/probar-e2e.sh [argumentos de playwright test]
# Levanta el proyecto sjlc-pruebas (127.0.0.1:18080), lo siembra con datos ficticios y al terminar lo apaga y borra
# (solo ese proyecto). Playwright corre en un contenedor temporal con la red del host; no se instala nada en el servidor.
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

echo "Levantando sjlc-pruebas…"
docker compose "${PRU[@]}" up -d --build --wait bd > /dev/null 2>&1 || { echo "No levantó bd" >&2; exit 1; }
./scripts/migrar.sh sjlc-pruebas > /dev/null 2>&1 && ./scripts/sembrar.sh produccion sjlc-pruebas > /dev/null 2>&1 \
  && ./scripts/sembrar.sh pruebas sjlc-pruebas > /dev/null 2>&1 || { echo "Falló la migración o la siembra" >&2; exit 1; }
docker compose "${PRU[@]}" up -d --build --wait backend web > /tmp/e2e-up.log 2>&1 || { tail -5 /tmp/e2e-up.log >&2; exit 1; }

mkdir -p e2e/resultados
docker run --rm --init --ipc=host --network host --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e URL_BASE=http://localhost:18080 -e PRUEBAS_CONTRASENA \
  -v "$PWD/e2e:/origen:ro" -v "$PWD/e2e/resultados:/tmp/e2e-resultados" \
  mcr.microsoft.com/playwright:v1.58.0-noble \
  bash -c 'cp -r /origen /tmp/e2e && cd /tmp/e2e && npm install --no-audit --no-fund --silent && npx playwright test "$@"' _ "$@"

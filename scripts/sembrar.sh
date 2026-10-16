#!/usr/bin/env bash
# Carga datos iniciales: ./scripts/sembrar.sh produccion|pruebas [proyecto-compose]
set -euo pipefail
cd "$(dirname "$0")/.."
modo="${1:-}"
[[ "$modo" == produccion || "$modo" == pruebas ]] || { echo "Uso: $0 produccion|pruebas [proyecto-compose]" >&2; exit 1; }
. scripts/comun.sh
cargar_entorno "${2:-}"
: "${POSTGRES_USER:?Falta POSTGRES_USER en .env}" "${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}"
if [ "$modo" = pruebas ] && [ "$ENTORNO" = produccion ]; then
  echo "Error: el seed de pruebas no se ejecuta con ENTORNO=produccion" >&2; exit 1
fi
extra=()
if [ "$modo" = produccion ]; then
  vars=(ADMIN1_USUARIO ADMIN1_NOMBRE ADMIN1_CONTRASENA_TEMPORAL ADMIN2_USUARIO ADMIN2_NOMBRE ADMIN2_CONTRASENA_TEMPORAL)
else
  vars=(PRUEBAS_CONTRASENA)
fi
for v in "${vars[@]}"; do
  [ -n "${!v:-}" ] && extra+=(-e "$v")
done
preparar_imagen
docker compose "${PROY[@]}" "${ARCHIVOS[@]}" run --rm \
  -e POSTGRES_USER -e POSTGRES_PASSWORD "${extra[@]}" backend npm run "sembrar:$modo"

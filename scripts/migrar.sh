#!/usr/bin/env bash
# Aplica las migraciones pendientes: ./scripts/migrar.sh [proyecto-compose]
# Equivale a: docker compose run --rm backend npm run migrar
# Solo esta ejecución puntual recibe las credenciales del dueño de la BD.
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno "${1:-}"
: "${POSTGRES_USER:?Falta POSTGRES_USER en .env}" "${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}"
preparar_imagen
docker compose "${PROY[@]}" "${ARCHIVOS[@]}" run --rm \
  -e POSTGRES_USER -e POSTGRES_PASSWORD backend npm run migrar

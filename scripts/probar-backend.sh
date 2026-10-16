#!/usr/bin/env bash
# Pruebas del backend en una base desechable: ./scripts/probar-backend.sh [argumentos de vitest]
# Crea sjlc_prueba_*, migra, siembra, corre vitest dentro del contenedor del backend y borra la base.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno ""
: "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${BD_CONTRASENA_APP:?}" "${PRUEBAS_CONTRASENA:?Falta PRUEBAS_CONTRASENA en .env}"
[ "$ENTORNO" != produccion ] || { echo "Error: estas pruebas no corren con ENTORNO=produccion" >&2; exit 1; }

dc() { docker compose "${PROY[@]}" "${ARCHIVOS[@]}" "$@"; }
bd="sjlc_prueba_be_$(date +%s)_$$"
limpiar() { dc exec -T bd psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$bd\" WITH (FORCE)" > /dev/null 2>&1 || true; }
trap limpiar EXIT

dc up -d --wait bd > /dev/null 2>&1 || { echo "No se pudo levantar bd" >&2; exit 1; }
dc exec -T bd psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$bd\"" || exit 1
preparar_imagen

backend() { dc run --rm -T -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB="$bd" "$@"; }
echo "Base desechable: $bd"
backend backend npm run migrar > /dev/null || { echo "Falló la migración" >&2; exit 1; }
backend -e ADMIN1_USUARIO -e ADMIN1_NOMBRE -e ADMIN1_CONTRASENA_TEMPORAL -e ADMIN2_USUARIO -e ADMIN2_NOMBRE -e ADMIN2_CONTRASENA_TEMPORAL backend npm run sembrar:produccion > /dev/null || { echo "Falló el seed de producción" >&2; exit 1; }
backend -e PRUEBAS_CONTRASENA backend npm run sembrar:pruebas > /dev/null || { echo "Falló el seed de pruebas" >&2; exit 1; }

# La clave de firma de las pruebas es aleatoria: nunca se usa la real
backend -e PRUEBAS_CONTRASENA -e JWT_SECRETO="$(openssl rand -hex 32)" -e ENTORNO=pruebas \
  -v "$PWD/backend/tests:/app/tests:ro" -v "$PWD/backend/vitest.config.ts:/app/vitest.config.ts:ro" \
  backend npx vitest run "$@"

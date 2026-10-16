#!/usr/bin/env bash
# Restaura un respaldo: ./scripts/restaurar.sh <archivo.dump> [proyecto-compose] [--produccion]
# Por defecto restaura en sjlc-pruebas, sobre una base nueva "<BD>_restaurada".
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh

archivo=""; proyecto=""; prod=0
for a in "$@"; do
  case "$a" in
    --produccion) prod=1 ;;
    *) if [ -z "$archivo" ]; then archivo="$a"; else proyecto="$a"; fi ;;
  esac
done
[ -n "$archivo" ] || { echo "Uso: $0 <archivo.dump> [proyecto-compose] [--produccion]" >&2; exit 1; }
[ -r "$archivo" ] && [ -s "$archivo" ] || { echo "Error: no existe, está vacío o no se puede leer: $archivo" >&2; exit 1; }
proyecto="${proyecto:-sjlc-pruebas}"

cargar_entorno "$proyecto"
: "${POSTGRES_USER:?Falta POSTGRES_USER en .env}" "${POSTGRES_DB:?Falta POSTGRES_DB en .env}"
dc() { docker compose "${PROY[@]}" "${ARCHIVOS[@]}" "$@"; }

dc exec -T bd pg_restore --list < "$archivo" > /dev/null \
  || { echo "Error: el archivo no es un respaldo válido de PostgreSQL" >&2; exit 1; }

if [ "$proyecto" = sjlc-pruebas ] || [ "$proyecto" = sjlc-dev ]; then
  es_prod=0; destino="${POSTGRES_DB}_restaurada"
else
  es_prod=1; destino="$POSTGRES_DB"
  [ "$prod" = 1 ] || { echo "Error: el proyecto '$proyecto' es producción; agregue --produccion" >&2; exit 1; }
fi

echo "Archivo:  $archivo"
echo "Proyecto: $proyecto"
echo "Base destino: $destino"
read -r -p "Escriba el nombre de la base de datos para confirmar: " r1
[ "$r1" = "$destino" ] || { echo "No coincide. Cancelado, no se tocó nada." >&2; exit 1; }
if [ "$es_prod" = 1 ]; then
  echo "ATENCIÓN: se reemplazará el contenido de la base de PRODUCCIÓN."
  read -r -p "Escriba el nombre otra vez: " r2
  [ "$r2" = "$destino" ] || { echo "No coincide. Cancelado, no se tocó nada." >&2; exit 1; }
else
  existe=$(dc exec -T bd psql -U "$POSTGRES_USER" -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='$destino'")
  if [ "$existe" = 1 ]; then
    echo "La base '$destino' ya existe; se reemplazará su contenido (confirmado arriba)."
  else
    dc exec -T bd psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE \"$destino\"" > /dev/null
  fi
fi

# El rol de la aplicación vive en el servidor, no en el respaldo: debe existir antes de restaurar
# para que se conserven sus permisos. Su contraseña la fija después "scripts/migrar.sh".
dc exec -T bd psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres -c \
  "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'sjlc_app') THEN CREATE ROLE sjlc_app LOGIN; END IF; END \$\$" \
  || { echo "Error: no se pudo asegurar el rol sjlc_app" >&2; exit 1; }

dc exec -T bd pg_restore --clean --if-exists --no-owner \
  -U "$POSTGRES_USER" -d "$destino" < "$archivo" \
  || echo "Aviso: pg_restore reportó mensajes; revise el conteo de filas." >&2

# Ajustes a nivel de base de datos que pg_dump no incluye (los de las migraciones 001 y 008)
dc exec -T bd psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
ALTER DATABASE "$destino" SET timezone = 'America/Guatemala';
REVOKE CONNECT, TEMPORARY ON DATABASE "$destino" FROM PUBLIC;
GRANT CONNECT ON DATABASE "$destino" TO sjlc_app;
SQL

echo "Filas por tabla en $destino (esquema public):"
tablas=$(dc exec -T bd psql -U "$POSTGRES_USER" -d "$destino" -tAc "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1")
for t in $tablas; do
  n=$(dc exec -T bd psql -U "$POSTGRES_USER" -d "$destino" -tAc "SELECT count(*) FROM public.\"$t\"")
  printf '  %-40s %s\n' "$t" "$n"
done

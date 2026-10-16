#!/usr/bin/env bash
# Respaldo de la base de datos: ./scripts/respaldar.sh [proyecto-compose]
# Apto para cron (rutas absolutas, sin tty). Destino: ${DIR_RESPALDOS:-/opt/respaldos}
set -euo pipefail
umask 077
export TZ=America/Guatemala
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno "${1:-}"
: "${POSTGRES_USER:?Falta POSTGRES_USER en .env}" "${POSTGRES_DB:?Falta POSTGRES_DB en .env}"

destino="${DIR_RESPALDOS:-/opt/respaldos}"
mkdir -p "$destino" || { echo "Error: no se pudo crear $destino" >&2; exit 1; }
base="$destino/sjlc_$(date +%Y%m%d_%H%M)"
parcial="$base.dump.parcial"
final="$base.dump"
trap 'rm -f "$parcial"' EXIT

dc() { docker compose "${PROY[@]}" "${ARCHIVOS[@]}" "$@"; }

dc exec -T bd pg_dump -Fc -U "$POSTGRES_USER" "$POSTGRES_DB" > "$parcial" \
  || { echo "Error: pg_dump falló; no se creó el respaldo" >&2; exit 1; }
[ -s "$parcial" ] || { echo "Error: el respaldo quedó vacío" >&2; exit 1; }
dc exec -T bd pg_restore --list < "$parcial" > /dev/null \
  || { echo "Error: el respaldo no es legible con pg_restore --list" >&2; exit 1; }

chmod 600 "$parcial"
mv "$parcial" "$final"
echo "Respaldo creado: $final ($(du -h "$final" | cut -f1))"

# Retención: 14 días, solo archivos sjlc_*.dump
find "$destino" -maxdepth 1 -type f -name 'sjlc_*.dump' -mtime +14 -delete

# Cron propuesto para producción (NO instalado; se instala en la Fase 14):
# 0 2 * * * /opt/sjlc/sistema/scripts/respaldar.sh >> /var/log/sjlc-respaldo.log 2>&1

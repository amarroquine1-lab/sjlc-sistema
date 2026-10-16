#!/usr/bin/env bash
# Actualiza producción a una versión publicada: ./scripts/actualizar.sh v1.1
set -euo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh

version="${1:-}"
[[ "$version" =~ ^v[0-9]+\.[0-9]+(\.[0-9]+)?$ ]] || { echo "Uso: $0 vX.Y" >&2; exit 1; }
[ -f .env ] || { echo "Falta el archivo .env" >&2; exit 1; }

export SJLC_VERSION="$version"
echo "Descargando imágenes $version..."
docker compose pull
cargar_env_seguro
# La versión pedida manda sobre la del .env (cargar_env_seguro la pisó) y queda registrada para los próximos comandos
export SJLC_VERSION="$version"
if grep -q '^SJLC_VERSION=' .env; then sed -i "s/^SJLC_VERSION=.*/SJLC_VERSION=$version/" .env; else echo "SJLC_VERSION=$version" >> .env; fi
reciente=$(find "${DIR_RESPALDOS:-/opt/respaldos}" -maxdepth 1 -type f -name 'sjlc_*.dump' -mmin -1440 2>/dev/null | head -n1)
if [ -z "$reciente" ]; then
  echo "No hay un respaldo de menos de 24 horas en ${DIR_RESPALDOS:-/opt/respaldos}." >&2
  echo "Ejecute primero ./scripts/respaldar.sh y vuelva a intentar." >&2
  exit 1
fi
echo "Aplicando migraciones con las imágenes nuevas..."
./scripts/migrar.sh
echo "Reiniciando servicios..."
docker compose up -d --wait
docker compose ps
echo "Versión $version en marcha."

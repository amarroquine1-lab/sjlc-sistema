#!/bin/sh
# Elige la configuración del sitio según ENTORNO (desarrollo | produccion)
set -eu
sitio="/etc/nginx/sitios/${ENTORNO:-desarrollo}.conf"
[ -f "$sitio" ] || { echo "ENTORNO inválido: ${ENTORNO:-}" >&2; exit 1; }
cp "$sitio" /tmp/sitio.conf

#!/usr/bin/env bash
# Regenera los rangos de Cloudflare que usa Nginx (IP real y lista de acceso).
set -euo pipefail
destino="$(cd "$(dirname "$0")/.." && pwd)/nginx/cloudflare"
mkdir -p "$destino"
rangos="$(curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6)"
rangos="$(echo "$rangos" | sed '/^$/d')"
[ "$(echo "$rangos" | wc -l)" -ge 10 ] || { echo "Respuesta inesperada de Cloudflare" >&2; exit 1; }

{
  echo "# Generado por scripts/rangos-cloudflare.sh el $(date +%F)"
  echo "$rangos" | sed 's/.*/set_real_ip_from &;/'
  echo "real_ip_header CF-Connecting-IP;"
} > "$destino/ip-real.conf"

{
  echo "# Generado por scripts/rangos-cloudflare.sh el $(date +%F)"
  echo "geo \$realip_remote_addr \$desde_cloudflare {"
  echo "    default 0;"
  echo "    127.0.0.1 1;"
  echo "    ::1 1;"
  echo "$rangos" | sed 's/.*/    & 1;/'
  echo "}"
} > "$destino/acceso.conf"
echo "Rangos actualizados en $destino"

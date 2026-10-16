#!/usr/bin/env bash
# Capturas de escritorio (1366x768) para los manuales: corre contra el entorno de desarrollo (sjlc-dev, datos ficticios).
# Agrega pacientes de demostración. Uso: ./scripts/capturar-manual.sh  → docs/capturas/
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno ""
: "${PRUEBAS_CONTRASENA:?Falta PRUEBAS_CONTRASENA en .env}"
[ "$ENTORNO" != produccion ] || { echo "Error: no corre con ENTORNO=produccion" >&2; exit 1; }
mkdir -p docs/capturas e2e/resultados/docs-capturas
docker run --rm --init --ipc=host --network host --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e URL_BASE="${URL_BASE:-http://localhost:8080}" -e PRUEBAS_CONTRASENA \
  -v "$PWD/e2e:/origen:ro" -v "$PWD/e2e/resultados:/tmp/e2e-resultados" \
  mcr.microsoft.com/playwright:v1.58.0-noble \
  bash -c 'cp -r /origen /tmp/e2e && cd /tmp/e2e && npm install --no-audit --no-fund --silent && npx playwright test -c playwright.manual.config.ts' || exit 1
cp e2e/resultados/docs-capturas/*.png docs/capturas/
echo "Capturas en docs/capturas/"

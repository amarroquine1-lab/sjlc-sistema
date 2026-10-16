#!/usr/bin/env bash
# Captura todas las pantallas (escritorio, tablet y móvil) contra sjlc-pruebas con datos ficticios.
# Uso: ./scripts/capturar-pantallas.sh antes|despues   → e2e/resultados/capturas/<antes|despues>/
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno ""
: "${PRUEBAS_CONTRASENA:?Falta PRUEBAS_CONTRASENA en .env}"
[ "$ENTORNO" != produccion ] || { echo "Error: no corre con ENTORNO=produccion" >&2; exit 1; }
momento="${1:?Uso: $0 antes|despues}"
PRU=(-p sjlc-pruebas -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.pruebas.yml)
limpiar() { docker compose "${PRU[@]}" down -v --remove-orphans > /dev/null 2>&1 || true; }
confirmar_borrar_pruebas || exit 1
trap limpiar EXIT
echo "Levantando sjlc-pruebas…"
docker compose "${PRU[@]}" up -d --build --wait bd > /dev/null 2>&1 || { echo "No levantó bd" >&2; exit 1; }
./scripts/migrar.sh sjlc-pruebas > /dev/null 2>&1 && ./scripts/sembrar.sh produccion sjlc-pruebas > /dev/null 2>&1 \
  && ./scripts/sembrar.sh pruebas sjlc-pruebas > /dev/null 2>&1 || { echo "Falló la migración o la siembra" >&2; exit 1; }
docker compose "${PRU[@]}" up -d --build --wait backend web > /tmp/captura-up.log 2>&1 || { tail -5 /tmp/captura-up.log >&2; exit 1; }
mkdir -p "e2e/resultados/capturas/$momento"
docker run --rm --init --ipc=host --network host --user "$(id -u):$(id -g)" \
  -e HOME=/tmp -e URL_BASE=http://localhost:18080 -e PRUEBAS_CONTRASENA -e CAPTURAS="$momento" \
  -v "$PWD/e2e:/origen:ro" -v "$PWD/e2e/resultados:/tmp/e2e-resultados" \
  mcr.microsoft.com/playwright:v1.58.0-noble \
  bash -c 'cp -r /origen /tmp/e2e && cd /tmp/e2e && npm install --no-audit --no-fund --silent && npx playwright test -c playwright.capturas.config.ts "$@"' _ "${@:2}"

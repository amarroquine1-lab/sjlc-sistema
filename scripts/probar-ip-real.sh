#!/usr/bin/env bash
# Verifica de punta a punta, a través de Nginx, que el backend usa la IP REAL del cliente
# (CF-Connecting-IP) y nunca la IP del contenedor web. Uso: ./scripts/probar-ip-real.sh
# Levanta el proyecto sjlc-pruebas (puertos 127.0.0.1:15432/13000/18080) con Nginx tratando a las
# redes privadas como si fueran Cloudflare, y al terminar lo apaga y borra (solo ese proyecto).
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno ""
: "${POSTGRES_USER:?}" "${POSTGRES_DB:?}" "${POSTGRES_PASSWORD:?}"
[ "$ENTORNO" != produccion ] || { echo "Error: esta prueba no corre con ENTORNO=produccion" >&2; exit 1; }

PRU=(-p sjlc-pruebas -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.pruebas.yml -f docker-compose.prueba-ip.yml)
URL="http://127.0.0.1:18080/api/autenticacion/ingresar"
fallos=0; aprobadas=0
limpiar() { docker compose "${PRU[@]}" down -v --remove-orphans > /dev/null 2>&1 || true; }
confirmar_borrar_pruebas || exit 1
trap limpiar EXIT
resultado() { if [ "$1" = 0 ]; then aprobadas=$((aprobadas + 1)); echo "  [OK]    $2"; else fallos=$((fallos + 1)); echo "  [FALLO] $2"; [ -n "${3:-}" ] && echo "$3" | sed 's/^/          /'; fi; }
sql() { docker compose "${PRU[@]}" exec -T bd psql -q -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tA -c "$1"; }
# Los nombres de usuario solo admiten letras a-z: los dígitos se cambian por letras
sololetras() { printf '%s' "$1" | tr '0-9' 'a-j'; }
intento() {  # intento <usuario> <cabecera extra...>: devuelve "codigo cuerpo"
  local u; u="$(sololetras "$1")"; shift
  curl -s -w ' %{http_code}' -X POST "$URL" -H 'Content-Type: application/json' "$@" -d "{\"usuario\":\"$u\",\"contrasena\":\"contrasena-incorrecta-1\"}"
}
ultima_ip() { sql "SELECT host(direccion_ip) FROM bitacora WHERE accion='inicio_sesion_fallido' AND nombre_usuario_intentado='$(sololetras "$1")' ORDER BY id_bitacora DESC LIMIT 1"; }

echo "== Preparación"
docker compose "${PRU[@]}" up -d --wait bd > /dev/null 2>&1; resultado $? "bd de sjlc-pruebas arriba"
./scripts/migrar.sh sjlc-pruebas > /dev/null 2>&1; resultado $? "migraciones aplicadas"
./scripts/sembrar.sh produccion sjlc-pruebas > /dev/null 2>&1 && ./scripts/sembrar.sh pruebas sjlc-pruebas > /dev/null 2>&1; resultado $? "seeds cargados"
docker compose "${PRU[@]}" up -d --wait backend web > /tmp/up-ip-real.log 2>&1; resultado $? "backend y Nginx arriba" "$(tail -3 /tmp/up-ip-real.log)"; rm -f /tmp/up-ip-real.log
ip_web="$(docker compose "${PRU[@]}" exec -T web hostname -i 2>/dev/null | tr -d '[:space:]')"
echo "  (IP del contenedor web en la red interna: $ip_web)"

echo; echo "== IP real a través de Nginx"
r="$(intento ipreal1 -H 'CF-Connecting-IP: 198.51.100.9')"; [ "${r##* }" = 401 ]; resultado $? "ingreso fallido responde 401" "$r"
ip="$(ultima_ip ipreal1)"; [ "$ip" = 198.51.100.9 ]; resultado $? "la bitácora guarda la IP de CF-Connecting-IP (198.51.100.9), no otra: '$ip'"
[ -n "$ip_web" ] && [ "$ip" != "$ip_web" ]; resultado $? "la IP guardada no es la del contenedor web ($ip_web)"

r="$(intento ipreal2 -H 'CF-Connecting-IP: 198.51.100.10' -H 'X-Forwarded-For: 6.6.6.6')"
ip="$(ultima_ip ipreal2)"; [ "$ip" = 198.51.100.10 ]; resultado $? "un X-Forwarded-For enviado por el cliente se ignora (IP '$ip', no 6.6.6.6)"

r="$(intento ipreal3 -H 'X-Forwarded-For: 6.6.6.6')"
ip="$(ultima_ip ipreal3)"; [ -n "$ip" ] && [ "$ip" != 6.6.6.6 ]; resultado $? "sin CF-Connecting-IP, un X-Forwarded-For falso no se acepta (IP '$ip')"

n="$(sql "SELECT count(*) FROM bitacora WHERE direccion_ip = '$ip_web'::inet")"
[ "$n" = 0 ]; resultado $? "ninguna fila de bitácora tiene la IP del contenedor web ($n filas)"

echo; echo "== Límite por IP real"
for i in $(seq 1 20); do intento "limite$i" -H 'CF-Connecting-IP: 198.51.100.20' > /dev/null; done
r="$(intento limite21 -H 'CF-Connecting-IP: 198.51.100.20')"
[ "${r##* }" = 429 ] && grep -q 'DEMASIADOS_INTENTOS' <<< "$r"; resultado $? "la IP 198.51.100.20 queda limitada tras 20 fallos (429)" "$r"
r="$(intento otrousuario -H 'CF-Connecting-IP: 198.51.100.21')"
[ "${r##* }" = 401 ]; resultado $? "otra IP real (198.51.100.21) NO queda limitada: no se bloquea a todos por la IP del contenedor web" "$r"
r="$(intento otrousuario2 -H 'CF-Connecting-IP: 198.51.100.20')"
[ "${r##* }" = 429 ]; resultado $? "la IP limitada sigue limitada aunque cambie de usuario" "$r"

echo; echo "== Sesión por Nginx"
cab="$(curl -s -i -X POST "$URL" -H 'Content-Type: application/json' -H 'CF-Connecting-IP: 198.51.100.30' -d "{\"usuario\":\"padmin\",\"contrasena\":\"$PRUEBAS_CONTRASENA\"}")"
grep -qi '^set-cookie: sjlc_sesion=' <<< "$cab" && grep -qi 'httponly' <<< "$cab" && grep -qi 'samesite=strict' <<< "$cab" && grep -qi 'secure' <<< "$cab"
resultado $? "ingreso correcto fija la cookie sjlc_sesion con HttpOnly, Secure y SameSite=Strict"
ip="$(sql "SELECT host(direccion_ip) FROM sesiones ORDER BY fecha_hora_inicio DESC LIMIT 1")"
[ "$ip" = 198.51.100.30 ]; resultado $? "la sesión guarda la IP real del cliente (198.51.100.30): '$ip'"
ip="$(sql "SELECT host(direccion_ip) FROM bitacora WHERE accion='inicio_sesion' ORDER BY id_bitacora DESC LIMIT 1")"
[ "$ip" = 198.51.100.30 ]; resultado $? "la bitácora de inicio de sesión guarda la IP real: '$ip'"

echo; echo "Resumen: $aprobadas verificaciones aprobadas, $fallos fallidas."
[ "$fallos" = 0 ]

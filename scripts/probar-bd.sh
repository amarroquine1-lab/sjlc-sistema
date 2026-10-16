#!/usr/bin/env bash
# Pruebas de la base de datos en una BD desechable: ./scripts/probar-bd.sh [proyecto-compose]
# Crea sjlc_prueba_*, migra, siembra, corre db/pruebas/*.sql y la borra al terminar.
# Requiere el contenedor bd del proyecto arriba. Nunca toca la base principal.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno "${1:-}"
: "${POSTGRES_USER:?Falta POSTGRES_USER en .env}" "${POSTGRES_PASSWORD:?Falta POSTGRES_PASSWORD en .env}" "${BD_CONTRASENA_APP:?Falta BD_CONTRASENA_APP en .env}"
[ "$ENTORNO" != produccion ] || { echo "Error: estas pruebas no corren con ENTORNO=produccion" >&2; exit 1; }

export PGPASSWORD="$BD_CONTRASENA_APP"   # solo en el entorno del proceso; no viaja en argumentos
dc() { docker compose "${PROY[@]}" "${ARCHIVOS[@]}" "$@"; }
bd="sjlc_prueba_$(date +%s)_$$"
NMIG="$(ls db/migraciones/*.sql | wc -l)"
tmp="$(mktemp -d)"
fallos=0; aprobadas=0

limpiar() {
  dc exec -T bd psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE IF EXISTS \"$bd\" WITH (FORCE)" > /dev/null 2>&1 || true
  rm -rf "$tmp"
}
trap limpiar EXIT

pg() { dc exec -T bd psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$1" "${@:2}"; }
ejecutar_backend() {  # ejecutar_backend <variables -e ...> -- <comando...>
  dc run --rm -T -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB="$bd" -e ENTORNO="${ENTORNO_PRUEBA:-pruebas}" "$@"
}
resultado() {  # resultado <0|1> <descripción> [detalle]
  if [ "$1" = 0 ]; then aprobadas=$((aprobadas + 1)); echo "  [OK]    $2"
  else fallos=$((fallos + 1)); echo "  [FALLO] $2"; [ -n "${3:-}" ] && echo "$3" | sed 's/^/          /'; fi
}

echo "Base desechable: $bd"
pg postgres -c "CREATE DATABASE \"$bd\"" || { echo "No se pudo crear la base desechable (¿está arriba bd?)" >&2; exit 1; }
preparar_imagen

echo; echo "== Migraciones"
salida="$(ejecutar_backend backend npm run migrar 2>&1)"; codigo=$?
resultado $codigo "migrar desde una base vacía" "$salida"
[ "$(grep -c '^Aplicada:' <<< "$salida")" = "$NMIG" ]; resultado $? "se aplicaron las $NMIG migraciones"

salida="$(ejecutar_backend backend npm run migrar 2>&1)"; codigo=$?
resultado $codigo "migrar por segunda vez termina sin error"
[ "$(grep -c '^Omitida' <<< "$salida")" = "$NMIG" ] && ! grep -q '^Aplicada:' <<< "$salida"; resultado $? "la segunda corrida omite las $NMIG y no aplica nada"

# Un archivo ya aplicado que cambió debe detener el migrador
mkdir -p "$tmp/db"; cp -r db/migraciones "$tmp/db/"
echo "-- cambio indebido" >> "$tmp/db/migraciones/002_catalogos.sql"
salida="$(ejecutar_backend -v "$tmp/db:/tmpdb:ro" -e DIR_DB=/tmpdb backend npm run migrar 2>&1)"; codigo=$?
[ "$codigo" -ne 0 ] && grep -q 'ya fue aplicada pero su contenido cambió' <<< "$salida"; resultado $? "un archivo aplicado y modificado detiene el migrador (código $codigo)" "$salida"
# Falta un archivo ya aplicado
rm "$tmp/db/migraciones/008_permisos.sql"; cp db/migraciones/002_catalogos.sql "$tmp/db/migraciones/002_catalogos.sql"
salida="$(ejecutar_backend -v "$tmp/db:/tmpdb:ro" -e DIR_DB=/tmpdb backend npm run migrar 2>&1)"; codigo=$?
[ "$codigo" -ne 0 ] && grep -q 'Faltan archivos de migración' <<< "$salida"; resultado $? "falta un archivo ya aplicado: el migrador se detiene (código $codigo)" "$salida"

echo; echo "== Rol de la aplicación"
# Se conecta por la IP del contenedor (por localhost el servidor confía sin contraseña)
r="$(dc exec -T -e PGPASSWORD bd sh -c 'psql -h "$(hostname -i)" -U sjlc_app -d '"$bd"' -tAc "SELECT current_user"' 2>&1)"
[ "$r" = sjlc_app ]; resultado $? "sjlc_app se conecta con la contraseña de BD_CONTRASENA_APP" "$r"
r="$(PGPASSWORD=clave-incorrecta dc exec -T -e PGPASSWORD bd sh -c 'psql -h "$(hostname -i)" -U sjlc_app -d '"$bd"' -tAc "SELECT 1"' 2>&1)"
[ "$r" != 1 ]; resultado $? "sjlc_app no entra con otra contraseña"

# Con inicio de sesión real como sjlc_app (no con SET ROLE desde el dueño)
como_app() { dc exec -T -e PGPASSWORD bd sh -c 'psql -h "$(hostname -i)" -U sjlc_app -d '"$bd"' -tAc "$1"' sh "$1" 2>&1; }
r="$(como_app 'SHOW is_superuser')"; [ "$r" = off ]; resultado $? "sesión real de sjlc_app: no es superusuario" "$r"
r="$(como_app 'SET ROLE pg_monitor')"; grep -q 'permission denied' <<< "$r"; resultado $? "sesión real de sjlc_app: SET ROLE a otro rol se rechaza" "$r"
r="$(como_app "SET ROLE $POSTGRES_USER")"; grep -q 'permission denied' <<< "$r"; resultado $? "sesión real de sjlc_app: no puede tomar el rol del dueño" "$r"
r="$(como_app 'CREATE TABLE intruso (a integer)')"; grep -q 'permission denied' <<< "$r"; resultado $? "sesión real de sjlc_app: CREATE TABLE se rechaza" "$r"
r="$(como_app 'DROP TABLE pacientes')"; grep -q 'must be owner' <<< "$r"; resultado $? "sesión real de sjlc_app: DROP TABLE se rechaza" "$r"
r="$(como_app 'DELETE FROM pacientes')"; grep -q 'permission denied' <<< "$r"; resultado $? "sesión real de sjlc_app: DELETE en pacientes se rechaza" "$r"
r="$(como_app 'SELECT count(*) FROM pg_authid')"; grep -q 'permission denied' <<< "$r"; resultado $? "sesión real de sjlc_app: no lee contraseñas de roles (pg_authid)" "$r"

echo; echo "== Seeds"
salida="$(ejecutar_backend -e PRUEBAS_CONTRASENA -e ADMIN1_USUARIO -e ADMIN1_NOMBRE -e ADMIN1_CONTRASENA_TEMPORAL -e ADMIN2_USUARIO -e ADMIN2_NOMBRE -e ADMIN2_CONTRASENA_TEMPORAL backend npm run sembrar:produccion 2>&1)"; codigo=$?
resultado $codigo "sembrar producción" "$salida"
salida="$(ejecutar_backend -e PRUEBAS_CONTRASENA backend npm run sembrar:pruebas 2>&1)"; codigo=$?
resultado $codigo "sembrar pruebas" "$salida"
salida="$(ejecutar_backend -e PRUEBAS_CONTRASENA backend npm run sembrar:pruebas 2>&1)"; codigo=$?
resultado $codigo "sembrar pruebas dos veces no duplica usuarios ni falla" "$salida"
n="$(pg "$bd" -tAc 'SELECT count(*) FROM municipios')"; [ "$n" = 340 ]; resultado $? "340 municipios cargados (hay $n)"
ENTORNO_PRUEBA=produccion salida="$(ENTORNO_PRUEBA=produccion ejecutar_backend -e PRUEBAS_CONTRASENA backend node dist/bd/sembrar.js pruebas 2>&1)"; codigo=$?
[ "$codigo" -ne 0 ] && grep -qi 'produccion' <<< "$salida"; resultado $? "seed de pruebas se niega con ENTORNO=produccion (código $codigo)" "$salida"
n="$(pg "$bd" -tAc "SELECT count(*) FROM usuarios WHERE nombre_usuario IN ('padmin','precepcion')")"
[ "$n" = 2 ]; resultado $? "el rechazo no dejó usuarios nuevos ni borró los existentes"

echo; echo "== Pruebas SQL (db/pruebas)"
for f in db/pruebas/[0-9]*.sql; do
  nombre="$(basename "$f")"
  salida="$(cat db/pruebas/_ayudas.sql "$f" | dc exec -T bd psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$bd" -f - 2>&1)"; codigo=$?
  ok="$(grep -c 'OK:' <<< "$salida" || true)"; mal="$(grep -c 'FALLO:' <<< "$salida" || true)"
  if [ "$codigo" = 0 ] && [ "$mal" = 0 ]; then
    aprobadas=$((aprobadas + ok)); echo "  [OK]    $nombre: $ok casos"
  else
    fallos=$((fallos + (mal > 0 ? mal : 1))); aprobadas=$((aprobadas + ok)); echo "  [FALLO] $nombre: $ok aprobados, $mal fallidos (código $codigo)"
    grep -E 'FALLO:|ERROR:' <<< "$salida" | sed 's/^/          /'
  fi
done

echo; echo "Resumen: $aprobadas verificaciones aprobadas, $fallos fallidas."
[ "$fallos" = 0 ]

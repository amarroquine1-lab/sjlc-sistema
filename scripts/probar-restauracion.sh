#!/usr/bin/env bash
# Prueba de respaldo y restauración: respalda sjlc-dev y restaura en un proyecto aparte (sjlc-pruebas).
# Uso: ./scripts/probar-restauracion.sh
# Al terminar apaga y borra SOLO el proyecto sjlc-pruebas (datos ficticios). No toca sjlc-dev.
set -uo pipefail
cd "$(dirname "$0")/.."
. scripts/comun.sh
cargar_entorno ""
: "${POSTGRES_USER:?}" "${POSTGRES_PASSWORD:?}" "${POSTGRES_DB:?}" "${BD_CONTRASENA_APP:?}"
[ "$ENTORNO" != produccion ] || { echo "Error: esta prueba no corre con ENTORNO=produccion" >&2; exit 1; }

DEV=(-p sjlc-dev -f docker-compose.yml -f docker-compose.dev.yml)
export PGPASSWORD="$BD_CONTRASENA_APP"   # solo en el entorno del proceso; no viaja en argumentos
PRU=(-p sjlc-pruebas -f docker-compose.yml -f docker-compose.dev.yml -f docker-compose.pruebas.yml)
tmp="$(mktemp -d)"; fallos=0; aprobadas=0
destino="${POSTGRES_DB}_restaurada"
limpiar() { docker compose "${PRU[@]}" down -v --remove-orphans > /dev/null 2>&1 || true; rm -rf "$tmp"; }
confirmar_borrar_pruebas || exit 1
trap limpiar EXIT
resultado() { if [ "$1" = 0 ]; then aprobadas=$((aprobadas + 1)); echo "  [OK]    $2"; else fallos=$((fallos + 1)); echo "  [FALLO] $2"; [ -n "${3:-}" ] && echo "$3" | sed 's/^/          /'; fi; }
psql_dev() { docker compose "${DEV[@]}" exec -T bd psql -q -U "$POSTGRES_USER" -d "$1" -tA -c "$2"; }
psql_pru() { docker compose "${PRU[@]}" exec -T bd psql -q -U "$POSTGRES_USER" -d "$1" -tA -c "$2"; }
huella() {  # huella <psql_dev|psql_pru> <base>: conteo y md5 por tabla
  local f="$1" b="$2" t
  for t in $($f "$b" "SELECT tablename FROM pg_tables WHERE schemaname='public' ORDER BY 1"); do
    printf '%s %s\n' "$t" "$($f "$b" "SELECT count(*) || ' ' || coalesce(md5(string_agg(x::text, '|' ORDER BY x::text)), '-') FROM public.\"$t\" x")"
  done
}

echo "== Respaldo"
docker compose "${DEV[@]}" up -d --wait bd > /dev/null 2>&1
touch -d '20 days ago' "$tmp/sjlc_viejo.dump" "$tmp/otro_viejo.dump"; touch "$tmp/sjlc_reciente.dump"
salida="$(DIR_RESPALDOS="$tmp" ./scripts/respaldar.sh 2>&1)"; codigo=$?
resultado $codigo "respaldar.sh termina sin error" "$salida"
dump="$(ls "$tmp"/sjlc_2*.dump 2>/dev/null | head -1)"
[ -n "$dump" ] && [ -s "$dump" ]; resultado $? "se creó un respaldo no vacío"
[ "$(stat -c %a "$dump" 2>/dev/null)" = 600 ]; resultado $? "el respaldo tiene permisos 600"
[ ! -e "$tmp/sjlc_viejo.dump" ]; resultado $? "se borró el respaldo sjlc_* de más de 14 días"
[ -e "$tmp/otro_viejo.dump" ]; resultado $? "no se borró un archivo viejo con otro nombre"
[ -e "$tmp/sjlc_reciente.dump" ]; resultado $? "no se borró un respaldo reciente"
ls "$tmp"/*.parcial > /dev/null 2>&1; [ $? -ne 0 ]; resultado $? "no quedan archivos .parcial"
docker compose "${DEV[@]}" exec -T bd pg_restore --list < "$dump" > /dev/null; resultado $? "pg_restore --list lee el respaldo"

echo; echo "== Casos que deben rechazarse"
printf '%s\n' "$destino" | ./scripts/restaurar.sh "$tmp/no_existe.dump" sjlc-pruebas > /dev/null 2>&1; [ $? -ne 0 ]; resultado $? "restaurar.sh rechaza un archivo que no existe"
head -c 2000 "$dump" > "$tmp/dañado.dump"
docker compose "${PRU[@]}" up -d --wait bd > /dev/null 2>&1; resultado $? "levantar bd de sjlc-pruebas (127.0.0.1:15432)"
printf '%s\n' "$destino" | ./scripts/restaurar.sh "$tmp/dañado.dump" sjlc-pruebas > "$tmp/s.txt" 2>&1; c=$?
[ $c -ne 0 ] && grep -q 'no es un respaldo válido' "$tmp/s.txt"; resultado $? "restaurar.sh rechaza un archivo dañado" "$(cat "$tmp/s.txt")"
printf 'otra_base\n' | ./scripts/restaurar.sh "$dump" sjlc-pruebas > "$tmp/s.txt" 2>&1; c=$?
[ $c -ne 0 ] && grep -q 'Cancelado' "$tmp/s.txt"; resultado $? "una confirmación incorrecta cancela sin tocar nada" "$(cat "$tmp/s.txt")"
[ "$(psql_pru postgres "SELECT count(*) FROM pg_database WHERE datname='$destino'")" = 0 ]; resultado $? "la base destino no se creó tras la confirmación incorrecta"
printf '%s\n%s\n' "$destino" "$destino" | ./scripts/restaurar.sh "$dump" sjlc-otro > "$tmp/s.txt" 2>&1; [ $? -ne 0 ]; resultado $? "un proyecto distinto de pruebas o desarrollo exige --produccion (no restaura)"

echo; echo "== Restauración en sjlc-pruebas"
printf '%s\n' "$destino" | ./scripts/restaurar.sh "$dump" sjlc-pruebas > "$tmp/restauracion.txt" 2>&1; codigo=$?
resultado $codigo "restaurar.sh termina sin error" "$(tail -5 "$tmp/restauracion.txt")"
huella psql_dev "$POSTGRES_DB" > "$tmp/origen.txt"; huella psql_pru "$destino" > "$tmp/restaurada.txt"
tablas="$(wc -l < "$tmp/origen.txt")"
[ "$tablas" -ge 24 ]; resultado $? "se compararon $tablas tablas (se esperan 24)"
diff "$tmp/origen.txt" "$tmp/restaurada.txt" > "$tmp/dif.txt"; resultado $? "conteo de filas y huella md5 idénticos en todas las tablas" "$(head -10 "$tmp/dif.txt")"
filas="$(awk '{s+=$2} END {print s}' "$tmp/origen.txt")"; echo "          (filas totales comparadas: $filas)"

echo; echo "== Rol de la aplicación tras restaurar"
r="$(psql_pru "$destino" "SELECT has_table_privilege('sjlc_app','public.pacientes','SELECT') AND NOT has_table_privilege('sjlc_app','public.pacientes','DELETE') AND NOT has_table_privilege('sjlc_app','public.pacientes','TRUNCATE')")"
[ "$r" = t ]; resultado $? "los permisos de sjlc_app se conservaron (SELECT sí; DELETE y TRUNCATE no)" "$r"
r="$(psql_pru "$destino" "SELECT count(*) FROM pg_trigger WHERE tgname LIKE '%bloquear_borrado'")"
[ "$r" -ge 20 ]; resultado $? "los triggers de bloqueo se restauraron ($r)"
r="$(psql_pru postgres "SELECT setconfig::text FROM pg_db_role_setting s JOIN pg_database d ON d.oid=s.setdatabase WHERE d.datname='$destino'")"
grep -q 'America/Guatemala' <<< "$r"; resultado $? "la zona horaria de la base restaurada es America/Guatemala" "$r"
# migrar sobre la base restaurada: omite todo y fija la contraseña de sjlc_app
previas="$(psql_pru "$destino" "SELECT count(*) FROM migraciones_aplicadas")"
salida="$(docker compose "${PRU[@]}" run --rm -T -e POSTGRES_USER -e POSTGRES_PASSWORD -e POSTGRES_DB="$destino" backend npm run migrar 2>&1)"; codigo=$?
[ $codigo = 0 ] && [ "$(grep -c '^Omitida' <<< "$salida")" = "$previas" ]; resultado $? "migrar sobre la base restaurada omite las ya aplicadas ($previas) y fija la contraseña de sjlc_app" "$salida"
r="$(docker compose "${PRU[@]}" exec -T -e PGPASSWORD bd sh -c 'psql -h "$(hostname -i)" -U sjlc_app -d '"$destino"' -tAc "SELECT count(*) FROM pacientes"' 2>&1)"
[ "$r" -ge 1 ] 2> /dev/null; resultado $? "sjlc_app inicia sesión en la base restaurada y lee pacientes" "$r"
r="$(docker compose "${PRU[@]}" exec -T -e PGPASSWORD bd sh -c 'psql -h "$(hostname -i)" -U sjlc_app -d '"$destino"' -tAc "DELETE FROM pacientes"' 2>&1)"
grep -q 'permission denied' <<< "$r"; resultado $? "en la base restaurada sjlc_app sigue sin poder borrar" "$r"

echo; echo "Resumen: $aprobadas verificaciones aprobadas, $fallos fallidas."
[ "$fallos" = 0 ]

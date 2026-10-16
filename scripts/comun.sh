# Funciones compartidas por migrar.sh, sembrar.sh y los demás scripts. Se usa con "source".
# Carga .env como datos (CLAVE=valor), sin ejecutarlo como shell. Acepta valores entre comillas dobles.
cargar_env_seguro() {
  [ -f .env ] || { echo "Error: falta el archivo .env en $(pwd)" >&2; exit 1; }
  local linea clave valor n=0
  while IFS= read -r linea || [ -n "$linea" ]; do
    n=$((n + 1))
    [[ -z "${linea// /}" || "$linea" =~ ^[[:space:]]*# ]] && continue
    if [[ "$linea" =~ ^([A-Z_][A-Z0-9_]*)=(.*)$ ]]; then
      clave="${BASH_REMATCH[1]}"; valor="${BASH_REMATCH[2]}"
      if [[ "$valor" =~ ^\"(.*)\"$ ]]; then valor="${BASH_REMATCH[1]}"; fi
      export "$clave=$valor"
    else
      echo "Error: línea $n de .env no tiene el formato CLAVE=valor" >&2; exit 1
    fi
  done < .env
}

# Carga .env y arma la lista de archivos compose según ENTORNO y proyecto.
cargar_entorno() {
  cargar_env_seguro
  PROYECTO="${1:-}"
  ARCHIVOS=()
  case "${ENTORNO:-}" in
    desarrollo|pruebas)
      PROYECTO="${PROYECTO:-sjlc-dev}"
      ARCHIVOS=(-f docker-compose.yml -f docker-compose.dev.yml)
      [ "$PROYECTO" = "sjlc-pruebas" ] && ARCHIVOS+=(-f docker-compose.pruebas.yml)
      ;;
    produccion) ARCHIVOS=(-f docker-compose.yml) ;;
    *) echo "Error: ENTORNO en .env debe ser desarrollo, pruebas o produccion" >&2; exit 1 ;;
  esac
  PROY=()
  if [ -n "$PROYECTO" ]; then PROY=(-p "$PROYECTO"); fi
}

# En desarrollo y pruebas el código puede haber cambiado: reconstruye la imagen (usa caché)
preparar_imagen() {
  [ "${ENTORNO:-}" = produccion ] && return 0
  docker compose "${PROY[@]}" "${ARCHIVOS[@]}" build backend >/dev/null
}

# Los scripts de prueba recrean el proyecto sjlc-pruebas y al terminar borran su volumen (datos ficticios).
# Si ya existía un volumen de una corrida anterior, se pide confirmación antes de empezar: escribir "pruebas"
# en la terminal o definir CONFIRMAR_BORRAR_PRUEBAS=si (para ejecuciones sin terminal).
confirmar_borrar_pruebas() {
  docker volume ls -q --filter name='^sjlc-pruebas_datos_bd$' | grep -q . || return 0
  [ "${CONFIRMAR_BORRAR_PRUEBAS:-}" = si ] && return 0
  if [ -t 0 ]; then
    read -r -p "Existe el volumen sjlc-pruebas_datos_bd y este script lo borrará (datos ficticios; sjlc-dev no se toca). Escriba 'pruebas' para continuar: " respuesta
    [ "$respuesta" = pruebas ] && return 0
  fi
  echo "Cancelado: sjlc-pruebas_datos_bd ya existe y no se confirmó borrarlo (use CONFIRMAR_BORRAR_PRUEBAS=si)." >&2
  return 1
}

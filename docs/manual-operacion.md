# Manual de operación

Sistema de Expedientes Clínicos, Centro de Salud San José La Comunidad (zona 10, Mixco). Versión 1.1.

Para quien administra el servidor de producción. No se necesita un equipo de TI: todo se hace con unos pocos comandos y las secciones están escritas en el orden en que se usan.

Convenciones:

- Los comandos se escriben en una terminal del servidor de producción, con el usuario administrador (con `sudo`), dentro de `/opt/sjlc/sistema` salvo que se indique otra carpeta.
- Los scripts de `scripts/` reciben al final el nombre del proyecto de Docker Compose, que en producción es siempre `sjlc` (`./scripts/migrar.sh sjlc`, `./scripts/respaldar.sh sjlc`). En las versiones 1.0 y 1.0.1 es **obligatorio** (sin él el script se detiene); desde la 1.1 es opcional, pero conviene escribirlo siempre.
- Después de cada comando se indica **qué se espera ver**. Si el resultado es distinto, vaya a la sección 10 (solución de problemas).
- En ningún paso de este manual se escriben contraseñas ni claves. Se generan en el servidor y se guardan solo en el archivo `.env`.

---

## 1. Visión general y arquitectura

El sistema corre completo en Docker, con tres contenedores definidos en `docker-compose.yml`:

| Servicio | Imagen | Función | Puertos publicados |
|---|---|---|---|
| `web` | `ghcr.io/amarroquine1-lab/sjlc-web:<versión>` | Nginx: sirve la aplicación web, redirige HTTP a HTTPS, hace de intermediario de `/api` hacia el backend y solo acepta conexiones que vienen de Cloudflare | 80 y 443 (los únicos públicos) |
| `backend` | `ghcr.io/amarroquine1-lab/sjlc-backend:<versión>` | API del sistema (Node.js). Aplica los permisos por rol, la bitácora y el cierre automático del día | Ninguno |
| `bd` | `postgres:16.15-alpine` | Base de datos PostgreSQL, con los datos en el volumen `datos_bd` | Ninguno |

Redes:

- `interna`: red cerrada (sin salida a internet) que une `bd` y `backend`. La base de datos solo es alcanzable desde el backend.
- `frontal`: une `backend` y `web`.

Flujo de una consulta: navegador → Cloudflare (HTTPS) → servidor, puerto 443 → `web` (Nginx) → `backend` → `bd`.

Puntos importantes:

- **El servidor de producción nunca compila.** Solo descarga imágenes ya publicadas (`docker compose pull`). Las imágenes se publican automáticamente en el registro GHCR cuando se crea la etiqueta de versión (`v1.0`, `v1.1`, ...) en el repositorio.
- La versión que corre se controla con la variable `SJLC_VERSION` del archivo `.env`.
- Todos los contenedores usan la zona horaria `America/Guatemala` y rotan sus registros (3 archivos de 10 MB por contenedor).
- Los contenedores se reinician solos (`restart: unless-stopped`) y tienen verificación de salud. `backend` espera a que `bd` esté sana, y `web` espera a `backend`.
- PostgreSQL está ajustado para poca memoria (`shared_buffers` 256 MB, `max_connections` 30).

---

## 2. Requisitos del servidor y preparación

### 2.1 Requisitos

- Ubuntu 24.04 LTS, 1 vCPU, 1,9 GB de RAM como mínimo, 30 GB de disco.
- Docker Engine con el complemento Compose (`docker compose`) y `git`.
- UFW activo permitiendo **solo** los puertos 22, 80 y 443.
- fail2ban activo.
- Swap de 2 GB.
- Zona horaria `America/Guatemala`.
- Un usuario administrador con `sudo` y llaves SSH. El usuario `root` pertenece al proveedor: no se deshabilita ni se modifica.
- No se instala Node.js, PostgreSQL ni Nginx en el servidor: todo va dentro de los contenedores.

### 2.2 Preparación paso a paso

1. Zona horaria:

   ```bash
   sudo timedatectl set-timezone America/Guatemala
   timedatectl | grep "Time zone"
   ```

   Esperado: `Time zone: America/Guatemala (CST, -0600)`.

2. Swap de 2 GB (si `swapon --show` ya muestra 2 GB, omita este paso):

   ```bash
   sudo fallocate -l 2G /swapfile
   sudo chmod 600 /swapfile
   sudo mkswap /swapfile
   sudo swapon /swapfile
   echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
   swapon --show
   ```

   Esperado: una fila `/swapfile` de `2G`.

3. Cortafuegos (UFW). Primero permita SSH para no perder el acceso:

   ```bash
   sudo ufw allow 22/tcp
   sudo ufw allow 80/tcp
   sudo ufw allow 443/tcp
   sudo ufw enable
   sudo ufw status
   ```

   Esperado: estado `active` con las reglas 22, 80 y 443. Ningún otro puerto.

   Recuerde que los puertos que Docker publica **no pasan por UFW**. Por eso solo el servicio `web` publica puertos, y Nginx rechaza (respuesta vacía, código 444) todo lo que no venga de Cloudflare.

4. fail2ban:

   ```bash
   sudo apt update
   sudo apt install -y fail2ban
   sudo systemctl enable --now fail2ban
   sudo fail2ban-client status sshd
   ```

   Esperado: la cárcel `sshd` aparece como activa.

5. Docker y git (siga la guía oficial de Docker para Ubuntu 24.04 si aún no están instalados) y compruebe:

   ```bash
   docker --version
   docker compose version
   git --version
   ```

   Esperado: las tres versiones sin error.

6. Permita que su usuario use Docker sin `sudo` (necesario también para el respaldo automático). Cierre sesión y vuelva a entrar después:

   ```bash
   sudo usermod -aG docker "$USER"
   ```

7. Carpetas de trabajo:

   ```bash
   sudo mkdir -p /opt/sjlc /opt/respaldos
   sudo chown "$USER":"$USER" /opt/sjlc /opt/respaldos
   sudo chmod 700 /opt/respaldos
   ```

---

## 3. Despliegue inicial

### 3.1 Clonar el repositorio limpio

```bash
cd /opt/sjlc
git clone git@github.com:amarroquine1-lab/sjlc-sistema.git sistema
cd /opt/sjlc/sistema
git checkout v1.0
```

Es un repositorio privado: el servidor necesita una llave de despliegue de **solo lectura** registrada en GitHub (o el método de acceso que usted haya configurado). Esperado: la carpeta `/opt/sjlc/sistema` con `docker-compose.yml`, `scripts/`, `nginx/` y `db/`.

### 3.2 Crear el archivo `.env`

1. Copie la plantilla y restrinja los permisos:

   ```bash
   cd /opt/sjlc/sistema
   cp .env.ejemplo .env
   chmod 600 .env
   ls -l .env
   ```

   Esperado: `-rw------- 1 <usuario> <usuario> ... .env`.

2. Abra el archivo y llene los valores que no son secretos:

   ```bash
   nano .env
   ```

   | Variable | Qué poner |
   |---|---|
   | `TZ` | `America/Guatemala` |
   | `SJLC_VERSION` | La versión a correr, por ejemplo `v1.0`. **Si queda vacía, Docker busca una imagen llamada `dev` que no existe** |
   | `POSTGRES_DB` | Nombre de la base de datos (una palabra, por ejemplo `sjlc`) |
   | `POSTGRES_USER` | Usuario dueño de la base de datos (propietario, solo para migraciones y respaldos) |
   | `ENTORNO` | `produccion` |
   | `PUERTO_BACKEND` | `3000` (déjelo así) |
   | `DOMINIO` | El dominio público del sistema |
   | `ADMIN1_USUARIO`, `ADMIN1_NOMBRE` | Usuario y nombre del primer administrador |
   | `ADMIN2_USUARIO`, `ADMIN2_NOMBRE` | Usuario y nombre del segundo administrador |
   | `HORA_CIERRE` | Hora del cierre automático en formato `HH:MM` (por omisión `20:00`) |

   Reglas del archivo: una variable por línea con el formato `CLAVE=valor`. Los valores con espacios (por ejemplo los nombres) van entre comillas dobles. No use `$`, comillas simples ni `\` en los valores. El usuario es la inicial más el apellido, en minúsculas, sin tildes ni ñ (por ejemplo `amarroquin`). **Deje vacías** `PRUEBAS_CONTRASENA`, `ORIGENES_PERMITIDOS` y `PROXY_CONFIABLE`: no se usan en producción.

3. Genere las claves **sin mostrarlas en pantalla**. Cada comando escribe el valor directamente en el archivo:

   ```bash
   sed -i "s|^JWT_SECRETO=.*|JWT_SECRETO=$(openssl rand -hex 32)|" .env
   sed -i "s|^POSTGRES_PASSWORD=.*|POSTGRES_PASSWORD=$(openssl rand -hex 24)|" .env
   sed -i "s|^BD_CONTRASENA_APP=.*|BD_CONTRASENA_APP=$(openssl rand -hex 24)|" .env
   sed -i "s|^ADMIN1_CONTRASENA_TEMPORAL=.*|ADMIN1_CONTRASENA_TEMPORAL=$(openssl rand -hex 12)|" .env
   sed -i "s|^ADMIN2_CONTRASENA_TEMPORAL=.*|ADMIN2_CONTRASENA_TEMPORAL=$(openssl rand -hex 12)|" .env
   ```

   Esperado: no imprimen nada. Compruebe que quedaron llenas sin mostrar los valores:

   ```bash
   grep -E '^(JWT_SECRETO|POSTGRES_PASSWORD|BD_CONTRASENA_APP|ADMIN[12]_CONTRASENA_TEMPORAL)=.+' .env | cut -d= -f1
   ```

   Esperado: las cinco variables listadas (solo los nombres).

   Para qué sirve cada clave:
   - `JWT_SECRETO` (mínimo 32 caracteres): firma las sesiones. Si falta o es más corta, el backend no arranca.
   - `POSTGRES_PASSWORD`: contraseña del dueño de la base. Solo se usa al **crear** la base la primera vez; cambiarla después en `.env` no la cambia dentro de PostgreSQL.
   - `BD_CONTRASENA_APP`: contraseña del rol `sjlc_app`, el único que usa la aplicación (sin permiso para borrar datos clínicos ni crear tablas). La migración la establece y la vuelve a aplicar cada vez que se ejecuta.
   - `ADMIN*_CONTRASENA_TEMPORAL` (mínimo 10 caracteres): contraseñas de un solo uso; el sistema obliga a cambiarlas en el primer ingreso (sección 5).

4. Guarde una copia del `.env` en un lugar seguro **fuera del servidor** (gestor de contraseñas o medio cifrado). Sin `JWT_SECRETO` y las contraseñas de base de datos no se puede reconstruir el servicio. El archivo nunca se sube a git.

### 3.3 Certificado de origen de Cloudflare

1. En Cloudflare, en el dominio, vaya a SSL/TLS, Servidor de origen, y cree un **Certificado de origen**. Guarde el certificado y la clave privada.
2. Colóquelos en el servidor con **exactamente estos nombres**:

   ```bash
   mkdir -p /opt/sjlc/sistema/certificados
   nano /opt/sjlc/sistema/certificados/origen.pem     # pegue el certificado
   nano /opt/sjlc/sistema/certificados/origen.key     # pegue la clave privada
   ```

3. Permisos. El contenedor `web` corre con el usuario `nginx` (UID 101), que debe poder leer la clave:

   ```bash
   sudo chown 101:101 /opt/sjlc/sistema/certificados/origen.key
   sudo chmod 600 /opt/sjlc/sistema/certificados/origen.key
   chmod 644 /opt/sjlc/sistema/certificados/origen.pem
   chmod 755 /opt/sjlc/sistema/certificados
   ls -ln /opt/sjlc/sistema/certificados
   ```

   Esperado: `origen.key` con propietario 101 y permisos `-rw-------`; `origen.pem` con `-rw-r--r--`.

La carpeta `certificados/` está fuera de git y el contenedor la monta en **solo lectura**. Sin estos dos archivos, `web` no arranca.

### 3.4 Autenticarse en GHCR (imágenes privadas)

1. En GitHub, con la cuenta dueña de las imágenes, cree un token de acceso personal (clásico) con **solamente** el permiso `read:packages`. Es un token de solo lectura de paquetes: no debe permitir escribir ni acceder a código.
2. Inicie sesión en el servidor sin dejar el token en el historial:

   ```bash
   read -rs TOKEN_GHCR
   echo "$TOKEN_GHCR" | docker login ghcr.io -u amarroquine1-lab --password-stdin
   unset TOKEN_GHCR
   ```

   Pegue el token cuando el cursor quede en espera (no se muestra). Esperado: `Login Succeeded`.

Docker guarda la credencial en `~/.docker/config.json`; proteja ese archivo (`chmod 600 ~/.docker/config.json`). No use en este servidor tokens con permisos de escritura.

### 3.5 Descargar imágenes y levantar la base de datos

1. Valide la configuración (no cambia nada):

   ```bash
   cd /opt/sjlc/sistema
   docker compose config -q && echo "Configuracion valida"
   ```

   Esperado: `Configuracion valida`. Si dice `Falta ... en .env`, complete esa variable.

2. Descargue las imágenes de la versión indicada en `SJLC_VERSION`:

   ```bash
   docker compose pull
   ```

   Esperado: `backend` y `web` en estado `Pulled`. (`bd` se descarga desde el registro público de Docker.)

3. Levante solo la base de datos y espere a que esté sana:

   ```bash
   docker compose up -d --wait bd
   docker compose ps
   ```

   Esperado: `bd` con estado `healthy`.

### 3.6 Migrar y sembrar

Los scripts leen `.env` y pasan las credenciales del dueño de la base únicamente en esta ejecución puntual.

1. Migraciones (crean las tablas y el rol `sjlc_app`):

   ```bash
   ./scripts/migrar.sh sjlc
   ```

   Esperado: una línea `Aplicada: NNN_...` por cada migración y el comando termina sin error. Es seguro repetirlo: las ya aplicadas se muestran como `Omitida`.

2. Datos iniciales de producción (roles, áreas, tipos de atención, catálogos, municipios y los dos administradores):

   ```bash
   ./scripts/sembrar.sh produccion sjlc
   ```

   Esperado: líneas `Ejecutado: seed-produccion.sql`, `Ejecutado: seed-municipios.sql`, `Usuario creado: <ADMIN1_USUARIO>` y `Usuario creado: <ADMIN2_USUARIO>`. Si se repite, dice `Usuario omitido (ya existe)` y no duplica nada.

   **Nunca** ejecute `sembrar.sh pruebas` en producción (el script se niega, pero evite intentarlo): son datos ficticios.

3. Elimine del `.env` las contraseñas temporales una vez que cada administrador haya ingresado y cambiado la suya (sección 5):

   ```bash
   sed -i "s|^ADMIN1_CONTRASENA_TEMPORAL=.*|ADMIN1_CONTRASENA_TEMPORAL=|;s|^ADMIN2_CONTRASENA_TEMPORAL=.*|ADMIN2_CONTRASENA_TEMPORAL=|" .env
   ```

### 3.7 Levantar todo y verificar

1. ```bash
   docker compose up -d --wait
   docker compose ps
   ```

   Esperado: `bd`, `backend` y `web` en `running` y `healthy`. `web` publica `0.0.0.0:80->8080` y `0.0.0.0:443->8443`.

2. Verificación local, desde el propio servidor (127.0.0.1 siempre está permitido):

   ```bash
   curl -sk https://127.0.0.1/api/salud
   ```

   Esperado: `{"estado":"ok","hora":"2026-..."}` con la hora de Guatemala (`-06:00`).

3. Verificación pública, con Cloudflare ya configurado (sección 4). Reemplace el dominio por el suyo:

   ```bash
   curl -s https://sistema.centrodesalud-sjlc.org/api/salud
   ```

   Esperado: la misma respuesta `{"estado":"ok",...}`. Abra también el dominio en un navegador: debe aparecer la pantalla de ingreso.

---

## 4. Cloudflare

1. **DNS**: registro `A` del subdominio (por ejemplo `sistema`) apuntando a la IP del servidor, con el **proxy activo** (nube naranja).
2. **SSL/TLS**: modo **Full (strict)**. Requiere el certificado de origen instalado en la sección 3.3.
3. **Rangos de Cloudflare**: Nginx solo atiende conexiones que provienen de los rangos publicados por Cloudflare, y toma la IP real del visitante de la cabecera `CF-Connecting-IP`. Esto afecta tres cosas:
   - Entrar por la IP del servidor, sin pasar por Cloudflare, no funciona (conexión cerrada sin respuesta). Es lo esperado.
   - La bitácora y los límites de intentos de ingreso usan la IP real del cliente.
   - Los rangos vienen incluidos en la imagen `web` (carpeta `nginx/cloudflare`). Se regeneran con `scripts/rangos-cloudflare.sh` desde el equipo de desarrollo y llegan a producción con una nueva versión. Cloudflare cambia sus rangos muy rara vez; si usted ve que cambiaron, avise para publicar una versión nueva.
4. El tráfico de HTTP (puerto 80) se redirige a HTTPS y se envía la cabecera de seguridad de transporte estricta.
5. Todo el centro sale a internet por una sola IP pública. Por eso el límite de fallos de ingreso por IP es alto (`LIMITE_FALLOS_IP`, 60 por 15 minutos por omisión) y no debe bajarse sin pensarlo.

---

## 5. Administradores y usuarios

### 5.1 Administradores iniciales

Se crean en el paso 3.6 a partir de `ADMIN1_USUARIO`, `ADMIN1_NOMBRE`, `ADMIN1_CONTRASENA_TEMPORAL`, `ADMIN2_USUARIO`, `ADMIN2_NOMBRE` y `ADMIN2_CONTRASENA_TEMPORAL`.

1. Lea la contraseña temporal de cada administrador y entréguela en persona (no por mensajes ni correo):

   ```bash
   grep '^ADMIN1_CONTRASENA_TEMPORAL=' .env
   ```

2. El administrador abre el sistema, ingresa con su usuario y la contraseña temporal. **El sistema obliga a cambiarla en el primer ingreso.** La nueva contraseña tiene mínimo 10 caracteres.
3. Cuando ambos hayan ingresado, borre las temporales del `.env` (último paso de 3.6).

Si la siembra se repite, no se vuelve a crear ni a restablecer a un administrador que ya existe.

### 5.2 Crear usuarios de las áreas

Los usuarios de recepción, signos, doctor, nutrición, vacunación y farmacia los crea un administrador desde la pantalla **Usuarios** (menú de administración).

1. Ingrese como administrador y abra **Usuarios**, luego **Crear usuario**.
2. Indique nombres, apellidos y rol. El usuario se genera con la inicial más el apellido, sin tildes ni ñ.
3. El sistema muestra la **contraseña temporal una sola vez**. Anótela y entréguela en persona. La persona deberá cambiarla en su primer ingreso.

### 5.3 Restablecer una contraseña

1. En **Usuarios**, busque a la persona y use **Restablecer contraseña**.
2. El sistema genera una contraseña temporal (se muestra una sola vez), obliga a cambiarla al ingresar y deja el hecho en la bitácora.
3. Solo los administradores pueden hacerlo. Las contraseñas no se pueden recuperar: se guardan con argon2id.

### 5.4 Desbloquear una cuenta

Tras 5 intentos fallidos la cuenta se bloquea 15 minutos. Si no quiere esperar: en **Usuarios**, use **Desbloquear** en esa cuenta. Si la persona olvidó la contraseña, restablézcala (5.3).

### 5.5 Desactivar usuarios

Cuando alguien deja el centro, desactive su usuario en **Usuarios**. No se borra: el historial clínico conserva quién atendió a cada paciente.

---

## 6. Respaldos

### 6.1 Qué hace `scripts/respaldar.sh`

- Genera un respaldo comprimido de la base con `pg_dump` en `/opt/respaldos/sjlc_AAAAMMDD_HHMM.dump` (permisos 600).
- Verifica que el archivo no esté vacío y sea legible; si falla, no deja un archivo a medias.
- **Retención de 14 días**: borra automáticamente los archivos `sjlc_*.dump` de más de 14 días en esa carpeta (no toca otros nombres).
- Lee `POSTGRES_USER` y `POSTGRES_DB` del `.env`. La carpeta de destino puede cambiarse con la variable `DIR_RESPALDOS` (por omisión `/opt/respaldos`).

Prueba manual:

```bash
cd /opt/sjlc/sistema
./scripts/respaldar.sh sjlc
ls -lh /opt/respaldos
```

Esperado: `Respaldo creado: /opt/respaldos/sjlc_<fecha>_<hora>.dump (<tamaño>)` y el archivo listado.

### 6.2 Respaldo diario automático (cron)

1. Abra el crontab de su usuario (el mismo que está en el grupo `docker`):

   ```bash
   crontab -e
   ```

2. Agregue esta línea (todos los días a las 2:00 a. m., hora de Guatemala):

   ```
   0 2 * * * /opt/sjlc/sistema/scripts/respaldar.sh sjlc >> /opt/respaldos/respaldo.log 2>&1
   ```

3. Compruebe al día siguiente:

   ```bash
   ls -lh /opt/respaldos
   tail -n 5 /opt/respaldos/respaldo.log
   ```

   Esperado: un archivo `.dump` nuevo cada día y la línea `Respaldo creado: ...` en el registro. Revise esto con frecuencia (por ejemplo cada semana); un respaldo que falla en silencio es el peor caso.

### 6.3 Copia cifrada fuera del servidor (paso manual a configurar)

El respaldo en el mismo servidor no protege ante la pérdida del servidor. **El sistema no hace esta copia por sí solo**: debe configurarla usted. Recomendación:

1. Cifre cada respaldo antes de sacarlo del servidor. Con `gpg` (clave simbólica; guarde la frase en un gestor de contraseñas, fuera del servidor):

   ```bash
   gpg --symmetric --cipher-algo AES256 --output /opt/respaldos/sjlc_AAAAMMDD_HHMM.dump.gpg /opt/respaldos/sjlc_AAAAMMDD_HHMM.dump
   ```

   Alternativa: `age` con una clave pública (la clave privada queda solo en poder del administrador).

2. Envíe solo el archivo **cifrado** a un almacenamiento externo (otra nube, otro equipo del administrador, disco externo). Con `rclone`, configurado una vez con `rclone config`:

   ```bash
   rclone copy /opt/respaldos/sjlc_AAAAMMDD_HHMM.dump.gpg destino:sjlc-respaldos
   ```

3. Pruebe periódicamente que puede descifrar y restaurar una copia externa (6.4). Un respaldo no probado no es un respaldo.
4. Los archivos con extensión `.gpg` no los borra la retención de 14 días: póngales su propia política de limpieza.

Nunca envíe respaldos sin cifrar ni los suba a git. Los datos reales de pacientes no deben salir de producción más que cifrados y hacia su propia copia de seguridad; no los lleve al servidor de desarrollo ni a ningún entorno de pruebas.

### 6.4 Comprobar un respaldo sin tocar producción

Antes de restaurar de verdad, verifique que el respaldo se lee y se carga bien en una base temporal dentro del mismo contenedor `bd`, sin tocar la base real:

1. Cree la base temporal y restaure en ella (reemplace el nombre del archivo):

   ```bash
   cd /opt/sjlc/sistema
   docker compose exec -T bd sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "CREATE DATABASE sjlc_verificacion"'
   docker compose exec -T bd sh -c 'pg_restore --no-owner -U "$POSTGRES_USER" -d sjlc_verificacion' < /opt/respaldos/sjlc_AAAAMMDD_HHMM.dump
   ```

   Esperado: sin errores graves (puede haber avisos menores).

2. Compare el número de pacientes y atenciones con la base real:

   ```bash
   docker compose exec -T bd sh -c 'psql -U "$POSTGRES_USER" -d sjlc_verificacion -tAc "SELECT (SELECT count(*) FROM pacientes), (SELECT count(*) FROM atenciones)"'
   docker compose exec -T bd sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT (SELECT count(*) FROM pacientes), (SELECT count(*) FROM atenciones)"'
   ```

   Esperado: dos cifras iguales (o la primera algo menor si hubo registros después del respaldo).

3. Elimine **únicamente** la base temporal (esto borra solo `sjlc_verificacion`; confirme el nombre antes de ejecutar):

   ```bash
   docker compose exec -T bd sh -c 'psql -U "$POSTGRES_USER" -d postgres -c "DROP DATABASE sjlc_verificacion"'
   ```

### 6.5 Restaurar en producción (emergencia)

Reemplaza **todo** el contenido de la base real con el del respaldo. Se pierde lo registrado después del respaldo. Haga esto solo con una decisión consciente.

1. Si puede, haga primero un respaldo del estado actual (`./scripts/respaldar.sh sjlc`) aunque esté dañado.
2. Detenga el sitio para que nadie escriba durante la restauración:

   ```bash
   docker compose stop web backend
   docker compose up -d --wait bd
   ```

3. Restaure. El nombre del proyecto de producción es `sjlc` y la opción `--produccion` es obligatoria:

   ```bash
   ./scripts/restaurar.sh /opt/respaldos/sjlc_AAAAMMDD_HHMM.dump sjlc --produccion
   ```

   El script verifica que el archivo sea un respaldo válido y pide escribir **dos veces** el nombre de la base (el valor de `POSTGRES_DB`) para confirmar. Si lo escrito no coincide, cancela sin tocar nada. Al terminar muestra el número de filas por tabla.

4. Reaplique las migraciones (omite las ya aplicadas y vuelve a fijar la contraseña del rol `sjlc_app`) y levante todo:

   ```bash
   ./scripts/migrar.sh sjlc
   docker compose up -d --wait
   curl -sk https://127.0.0.1/api/salud
   ```

   Esperado: respuesta `{"estado":"ok",...}`. Entre al sistema y revise que los últimos pacientes estén.

Si el servidor se perdió por completo: haga el despliegue inicial (sección 3) hasta `./scripts/migrar.sh` **sin** sembrar, y luego restaure el respaldo descifrado como arriba.

---

## 7. Actualizar a una versión nueva

Las versiones nuevas se publican como etiquetas (`v1.1`, ...) y GitHub genera las imágenes automáticamente. Esas imágenes pasan por un escaneo de vulnerabilidades críticas antes de publicarse. Si la publicación falló, la imagen no existe y `docker compose pull` dará error.

Procedimiento:

1. Respaldo reciente (el script de actualización exige uno de menos de 24 horas en `/opt/respaldos`):

   ```bash
   cd /opt/sjlc/sistema
   ./scripts/respaldar.sh sjlc
   ```

2. Traiga el código y los scripts de la versión nueva:

   ```bash
   git fetch --tags
   git checkout v1.1
   ```

3. Anote la versión que corría (para volver atrás) y escriba la nueva en `.env`:

   ```bash
   grep '^SJLC_VERSION=' .env
   sed -i "s|^SJLC_VERSION=.*|SJLC_VERSION=v1.1|" .env
   ```

4. Ejecute la actualización:

   ```bash
   ./scripts/actualizar.sh v1.1
   ```

   El script, en orden: descarga las imágenes de esa versión; comprueba que exista un respaldo de menos de 24 horas (si no, se detiene y le pide ejecutar `respaldar.sh`); aplica las migraciones con las imágenes nuevas; reinicia los servicios y espera a que estén sanos; y muestra el estado.

   Esperado al final: `docker compose ps` con los tres servicios `healthy` y `Versión v1.1 en marcha.`

5. Verifique:

   ```bash
   curl -sk https://127.0.0.1/api/salud
   ```

   y entre al sistema con un usuario de prueba de su confianza. Avise al personal que habrá un corte breve (menos de un minuto) y haga la actualización fuera del horario de consulta.

### Volver atrás

- **La versión nueva falla pero no hubo migraciones nuevas** (el script muestra solo `Omitida` en la migración): vuelva a poner la versión anterior en `.env` y reinicie:

  ```bash
  sed -i "s|^SJLC_VERSION=.*|SJLC_VERSION=v1.0|" .env
  git checkout v1.0
  docker compose pull
  docker compose up -d --wait
  ```

- **La versión nueva aplicó migraciones** (`Aplicada: ...`): las migraciones no se deshacen. Para volver a la versión anterior hay que restaurar el respaldo tomado en el paso 1 (sección 6.5, con `stop web backend` antes), poner la versión anterior en `.env` y levantar de nuevo. Se pierde lo registrado desde ese respaldo.

---

## 8. Operación diaria

### 8.1 Ver el estado

```bash
cd /opt/sjlc/sistema
docker compose ps
```

Esperado: `bd`, `backend` y `web` con estado `running` y `healthy`.

Comprobaciones rápidas:

```bash
curl -sk https://127.0.0.1/api/salud      # {"estado":"ok","hora":...}
df -h /                                     # espacio en disco
free -h                                     # memoria y swap
```

### 8.2 Registros (logs)

```bash
docker compose logs --tail 100 backend
docker compose logs --tail 100 web
docker compose logs --tail 100 bd
docker compose logs -f backend              # seguir en vivo (Ctrl+C para salir)
```

Los registros rotan solos: 3 archivos de 10 MB por contenedor, así que no llenan el disco. El registro de acceso de Nginx no guarda los parámetros de búsqueda (para no registrar DPI ni nombres). Los detalles técnicos de errores están en estos registros; los usuarios solo ven mensajes en español claro.

La bitácora de auditoría (quién hizo qué, con IP y valores anteriores y nuevos) está en el sistema, en la pantalla **Bitácora**, solo para administradores.

### 8.3 Cierre automático del día

A la hora definida en `HORA_CIERRE` (por omisión `20:00`, hora de Guatemala), el backend pasa las atenciones que siguen abiertas al estado **no concluida**. Para cambiar la hora:

```bash
nano .env                                   # HORA_CIERRE=21:00 (formato HH:MM de 24 horas)
docker compose up -d backend
```

Un valor mal escrito se ignora y se usa `20:00`. Nota: `docker compose restart` **no** relee el `.env`; use `up -d` cuando cambie variables.

### 8.4 Reiniciar servicios

```bash
docker compose restart backend       # solo el backend
docker compose restart web           # solo Nginx
docker compose up -d --wait          # aplica cambios del .env y levanta lo que falte
```

Evite reiniciar `bd` en horario de consulta. Si es necesario: `docker compose restart bd` (el backend se reconecta; confirme con `docker compose ps`).

Tras reiniciar el servidor completo, Docker levanta los contenedores solo (`restart: unless-stopped`). Compruebe con `docker compose ps` después de unos minutos.

### 8.5 Tareas periódicas

| Cuándo | Qué |
|---|---|
| Cada semana | Revisar que haya respaldos nuevos; revisar `df -h`; `docker compose ps` |
| Cada mes | Restaurar un respaldo en la base temporal (6.4); aplicar `sudo apt update && sudo apt upgrade` del sistema fuera del horario; revisar la bitácora por accesos extraños |
| Cada versión nueva | Sección 7 |

---

## 9. Seguridad

Lo que **sí** debe hacer:

- Mantener `.env` con permisos 600, fuera de git, con copia segura fuera del servidor.
- Acceder al servidor por SSH solo con llaves. UFW con solo 22, 80 y 443; fail2ban activo.
- Mantener el sistema operativo actualizado.
- Cifrar toda copia de respaldo que salga del servidor (6.3).
- Revisar la bitácora y desactivar de inmediato usuarios que ya no trabajan en el centro.
- Mantener el certificado de origen vigente (revise su fecha de vencimiento en Cloudflare).
- Usar únicamente imágenes publicadas por el proceso oficial (etiquetas `vX.Y`). Cada imagen se escanea contra vulnerabilidades críticas al publicarse. Para revisar una imagen ya descargada (en una máquina de confianza, por ejemplo con Trivy: `trivy image ghcr.io/amarroquine1-lab/sjlc-backend:v1.0`), hágalo antes de ponerla en producción.

Lo que **no** debe hacer:

- **No publicar puertos de `bd` ni de `backend`.** No agregue secciones `ports:` a esos servicios. Solo `web` publica puertos (80 y 443).
- **No montar el socket de Docker** (`/var/run/docker.sock`) en ningún contenedor.
- No usar la etiqueta `latest` ni dejar `SJLC_VERSION` vacía.
- No modificar `sshd_config` ni deshabilitar el usuario `root` (pertenece al proveedor del servidor).
- No ejecutar el seed de pruebas ni cargar datos ficticios en producción.
- No copiar datos reales de pacientes a equipos de desarrollo ni de pruebas.
- No compilar en el servidor de producción ni instalar Node.js, PostgreSQL ni Nginx en el host.
- No ejecutar `docker compose down -v`, `docker volume rm`, `docker volume prune` ni `docker system prune --volumes`: **borran el volumen `datos_bd` con todos los expedientes**. Un `docker compose down` sin `-v` es seguro, pero rara vez es necesario.
- No compartir contraseñas por mensajes; no reutilizar las contraseñas temporales.

### Rotación de `JWT_SECRETO`

Cámbiela si sospecha que se filtró, o cuando alguien con acceso al `.env` deja de colaborar:

```bash
sed -i "s|^JWT_SECRETO=.*|JWT_SECRETO=$(openssl rand -hex 32)|" .env
docker compose up -d backend
```

Efecto: **todas las sesiones abiertas quedan inválidas** y cada persona deberá ingresar de nuevo. No se pierde ningún dato. Hágalo fuera del horario de consulta.

### Rotación de contraseñas de base de datos

- `BD_CONTRASENA_APP`: cámbiela en `.env`, ejecute `./scripts/migrar.sh sjlc` (fija la nueva contraseña del rol `sjlc_app`) y luego `docker compose up -d backend`.
- `POSTGRES_PASSWORD`: cambiarla en `.env` **no** la cambia dentro de PostgreSQL. Si necesita rotarla, cámbiela primero en la base con `ALTER ROLE` y después en `.env`; consulte antes de hacerlo.

---

## 10. Solución de problemas

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| El sitio no carga (nada responde) | Contenedores detenidos; servidor apagado; DNS o proxy de Cloudflare mal | `docker compose ps`; si hay servicios caídos, `docker compose up -d --wait` y `docker compose logs --tail 100 web`. Pruebe `curl -sk https://127.0.0.1/api/salud` en el servidor: si responde, el problema está en Cloudflare o en la red |
| Error 521 de Cloudflare (servidor web caído) | `web` no está corriendo, o UFW/proveedor bloquean 443 | `docker compose ps` y logs de `web`; `sudo ufw status` debe permitir 443 |
| Error 522 (tiempo de espera) | El servidor no responde en 443 o hay saturación | Compruebe que el servidor está encendido, `sudo ufw status`, `free -h`, `df -h`; reinicie `web` |
| Error 525 o 526 (certificado) | Certificado de origen ausente, vencido o con nombre equivocado; SSL no está en Full (strict) | Verifique que existan `certificados/origen.pem` y `certificados/origen.key` (3.3); en Cloudflare ponga SSL en Full (strict); `docker compose restart web` |
| `web` se reinicia en bucle o dice `cannot load certificate` | Falta el certificado o la clave, o la clave no es legible por el usuario del contenedor | `docker compose logs --tail 50 web`; repita los permisos de 3.3 |
| `docker compose up` dice `Falta ... en .env` o el backend no arranca (`JWT_SECRETO debe tener al menos 32 caracteres`, `ENTORNO debe ser ...`) | Variable faltante o inválida en `.env` | Revise `.env` contra `.env.ejemplo`; `docker compose logs --tail 50 backend`; corrija y `docker compose up -d --wait` |
| `pull access denied` o `unauthorized` al descargar imágenes | Sesión de GHCR vencida o token sin permiso; versión inexistente | Repita 3.4; confirme que `SJLC_VERSION` es una etiqueta publicada |
| `manifest unknown` o busca la imagen `:dev` | `SJLC_VERSION` vacía o inexistente | Escriba una versión publicada (por ejemplo `v1.0`) en `.env` |
| La migración falla | `bd` no está sana; credenciales de `.env` incorrectas; un archivo ya aplicado fue modificado; faltan archivos | `docker compose ps` (`bd` debe estar `healthy`); revise `POSTGRES_USER`/`POSTGRES_PASSWORD`; el mensaje indica el archivo. Si dice que una migración ya aplicada cambió de contenido o que faltan archivos, está usando un código distinto al de la versión instalada: `git checkout vX.Y` de la versión correcta. No edite migraciones |
| Cambié `POSTGRES_PASSWORD` y ahora no conecta | PostgreSQL conserva la contraseña con que se creó la base | Restituya el valor original en `.env` |
| Una persona no puede ingresar: cuenta bloqueada | 5 intentos fallidos (bloqueo de 15 min) | Un administrador usa **Desbloquear** en **Usuarios** (5.4) |
| Mensaje de "demasiados intentos desde su ubicación" (429) | Se superó el límite de fallos de ingreso desde la IP del centro | Espere unos minutos; si pasó por error, revise la bitácora y que nadie esté probando contraseñas |
| Las horas se ven corridas | Zona horaria del servidor, de `TZ` o del navegador | `timedatectl` debe decir `America/Guatemala`; `TZ=America/Guatemala` en `.env`; `docker compose up -d`. La respuesta de `/api/salud` debe terminar en `-06:00`. Revise también la hora de la computadora del usuario |
| Disco lleno (`df -h` cerca de 100 %) | Respaldos acumulados, imágenes viejas, registros | Revise `/opt/respaldos` (`du -sh /opt/respaldos`); copie fuera lo que falte y retire los respaldos externos ya cifrados y guardados; `docker image prune` elimina solo imágenes sin uso (pida confirmación y lea lo que listará); nunca borre volúmenes |
| El servidor va lento o un contenedor se cae por memoria | Poca RAM, swap sin activar | `free -h`, `swapon --show` (debe haber 2 GB de swap); `docker stats --no-stream` |
| La impresora de tickets no imprime o sale con márgenes | Impresión desde el navegador: papel o márgenes incorrectos | En el cuadro de impresión del navegador elija la impresora Custom, papel de 80 mm, márgenes en "Ninguno", escala al 100 % y desactive encabezados y pies de página. Es una configuración de la computadora de recepción, no del servidor. Si el código de barras no sale, revise que el navegador permita imprimir gráficos de fondo |
| Se cierra la sesión sola | Por diseño: expira tras 15 minutos de inactividad (computadoras compartidas) | Es normal; ingresar de nuevo. Si ocurre en pleno uso o a todos a la vez, revise si se rotó `JWT_SECRETO` o se reinició el backend con una clave distinta |
| Las atenciones aparecen como "no concluida" | Cierre automático de las 20:00 (`HORA_CIERRE`) | Es normal. Cambie la hora si el centro atiende más tarde (8.3) |

Si nada de lo anterior resuelve el problema: guarde la salida de `docker compose ps` y de `docker compose logs --tail 200 backend` (sin copiar contraseñas) antes de reiniciar nada.

---

## 11. Lista de verificación posterior al despliegue

Marque cada punto antes de entregar el sistema al centro.

Servidor
- [ ] Zona horaria `America/Guatemala` (`timedatectl`).
- [ ] Swap de 2 GB activo (`swapon --show`).
- [ ] UFW activo con solo 22, 80 y 443; fail2ban activo.
- [ ] `docker compose ps`: `bd`, `backend` y `web` en `healthy`.
- [ ] Solo `web` publica puertos (`docker compose ps` no muestra puertos de `bd` ni `backend`).

Configuración
- [ ] `.env` con permisos 600, `ENTORNO=produccion` y `SJLC_VERSION` con la versión instalada.
- [ ] `JWT_SECRETO` y contraseñas de base generadas y con copia segura fuera del servidor.
- [ ] Certificado de origen en `certificados/` (`origen.pem` y `origen.key`) con permisos correctos.
- [ ] Contraseñas temporales de administradores borradas del `.env` tras el primer ingreso.

Cloudflare y acceso
- [ ] Registro DNS con proxy activo y SSL en Full (strict).
- [ ] `https://<dominio>/api/salud` responde `{"estado":"ok",...}`.
- [ ] Entrar por la IP del servidor no funciona (solo por Cloudflare).
- [ ] HTTP redirige a HTTPS.

Datos y usuarios
- [ ] Migraciones aplicadas y seed de producción ejecutado.
- [ ] Los dos administradores ingresaron y cambiaron su contraseña.
- [ ] Usuarios de todas las áreas creados y probados (cada uno ve solo su área).
- [ ] Las áreas cuentan con la hora correcta en pantalla.

Respaldos
- [ ] Línea de cron instalada y un respaldo de prueba creado.
- [ ] Respaldo comprobado en la base temporal (6.4).
- [ ] Copia cifrada fuera del servidor configurada y descifrada con éxito al menos una vez.

Operación
- [ ] Sesión expira a los 15 minutos de inactividad y el botón "Salir" funciona.
- [ ] Ticket impreso en la impresora de 80 mm desde el navegador de recepción.
- [ ] Cierre automático definido en la hora correcta (`HORA_CIERRE`).
- [ ] El administrador sabe dónde está este manual y cómo ver el estado y los registros (sección 8).

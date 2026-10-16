# Sistema de Expedientes Clínicos — Centro de Salud San José La Comunidad

Sistema web para llevar el **expediente clínico por paciente** y agilizar el flujo de atención del Centro de Salud San José La Comunidad (zona 10, Mixco, Guatemala). Reemplaza el libro de papel en el que cada visita era un número nuevo: ahora cada persona tiene **un solo expediente** con trazabilidad de todas sus visitas y de los tiempos de espera en cada área.

Proyecto de Graduación — Universidad Mariano Gálvez de Guatemala. Autor: **Abner Marroquín**.

## Qué hace

- **Expediente único** con código permanente (`SJLC-000123`) y **atención** por cada visita (`A-004587`).
- **Recepción:** registro y búsqueda (por código, DPI/CUI, nombre sin importar tildes, fecha de nacimiento o DPI del encargado), aviso de posibles duplicados y unión de registros, emergencias con registro rápido, ticket para impresora térmica de 80 mm.
- **Colas por área** que se actualizan solas: signos vitales, doctor (uno o dos simultáneos), nutrición, vacunación y farmacia.
- **Flujo entre áreas** validado en el servidor: signos → doctor / nutrición / vacunación; esas tres se envían pacientes entre sí; con una receta sin entregar, **farmacia es el cierre obligatorio** y cierra el ciclo con la entrega.
- **Datos clínicos versionados:** signos, consulta, receta, evaluación nutricional y vacunas se corrigen con una versión nueva; nada clínico se borra.
- **Historial completo del paciente** con el recorrido por áreas (hora de entrada y salida, quién atendió, motivo del envío).
- **Bitácora de auditoría** (quién, qué, cuándo, desde dónde, valor anterior y nuevo) visible solo para administradores.
- **Reportes** imprimibles en carta y en blanco y negro: atenciones, pacientes por área, tiempos de espera, medicamentos entregados, vacunas aplicadas.
- **Seguridad:** permisos por rol validados en cada endpoint, contraseñas con argon2id, bloqueo por intentos fallidos, sesión que expira a los 15 minutos de inactividad, cookies `httpOnly` y `SameSite=Strict`, sin correo electrónico (usuarios locales).

## Arquitectura

```
Navegador ── HTTPS ──▶ Cloudflare (proxy, SSL Full strict)
                            │
                            ▼  80 / 443
                    ┌───────────────┐        ┌───────────────┐        ┌───────────────┐
                    │  web (Nginx)  │ ─/api─▶│    backend    │ ─────▶ │ bd (PostgreSQL│
                    │  React (SPA)  │        │ Express + TS  │        │      16)      │
                    └───────────────┘        └───────────────┘        └───────────────┘
                       red "frontal"        redes "frontal" e "interna"     red "interna"
```

| Servicio | Tecnología | Función |
|---|---|---|
| `web` | Nginx sin privilegios + React 19 / TypeScript / Vite | Sirve la interfaz, hace proxy de `/api`, toma la IP real desde Cloudflare |
| `backend` | Node.js 22, Express 5, TypeScript, zod | API REST en español, permisos, bitácora |
| `bd` | PostgreSQL 16 (`unaccent`, `pg_trgm`) | Datos, restricciones y triggers de integridad |

Solo `web` publica puertos (80 y 443). La base de datos vive en una red interna sin salida a internet. Todo corre en Docker; el servidor solo necesita Docker.

## Estructura del repositorio

```
backend/     API (módulos: rutas, servicios, validaciones) y pruebas
frontend/    Interfaz React
db/          Migraciones SQL, semillas y pruebas SQL
nginx/       Configuración de Nginx y rangos de Cloudflare
scripts/     Migrar, sembrar, respaldar, restaurar, actualizar, pruebas
e2e/         Pruebas de punta a punta (Playwright)
docs/        Manuales, modelo de datos y diseño
.github/     Publicación de las imágenes al crear una versión
```

## Documentación

| Documento | Para quién |
|---|---|
| [`docs/manual-usuario.md`](docs/manual-usuario.md) | Personal del centro, por rol y paso a paso |
| [`docs/manual-operacion.md`](docs/manual-operacion.md) | Quien administra el servidor: despliegue, respaldos, actualizaciones |
| [`docs/modelo-er.md`](docs/modelo-er.md) | Modelo de datos y diccionario |
| [`docs/DESIGN.md`](docs/DESIGN.md) | Sistema de diseño de la interfaz |
| [`docs/capturas/`](docs/capturas/) | Capturas de pantalla (datos ficticios) |

## Instalación para desarrollo

Requisitos: Docker con el plugin Compose y git. No se instala Node.js ni PostgreSQL en el equipo.

```bash
cp .env.ejemplo .env            # llenar con valores propios; ENTORNO=desarrollo
./scripts/migrar.sh sjlc-dev    # crea el esquema
./scripts/sembrar.sh produccion sjlc-dev   # roles, tipos de atención, catálogos y administradores del .env
./scripts/sembrar.sh pruebas sjlc-dev      # (opcional) pacientes y atenciones ficticias
docker compose -p sjlc-dev -f docker-compose.yml -f docker-compose.dev.yml up -d --build
```

La interfaz queda en `http://localhost:8080` (y Vite con recarga en caliente en `http://localhost:5173`). Los puertos de desarrollo solo escuchan en `127.0.0.1`.

### Pruebas

```bash
./scripts/probar-bd.sh        # migraciones y reglas de la base de datos
./scripts/probar-backend.sh   # unitarias, integración y matriz de permisos
./scripts/probar-e2e.sh       # pruebas de punta a punta con Playwright (escritorio y tablet)
./scripts/probar-carga.sh     # carga con varios puestos simultáneos
```

Cada script levanta su propio entorno aislado (`sjlc-pruebas`) con datos ficticios y no toca el de desarrollo.

## Despliegue en producción

Producción **no compila**: descarga imágenes publicadas.

1. Al crear una etiqueta `vX.Y` en GitHub, el flujo `.github/workflows/publicar.yml` compila las imágenes `sjlc-backend` y `sjlc-web`, las escanea con Trivy y las publica en GitHub Container Registry (`ghcr.io`).
2. En el servidor: `docker-compose.yml` usa esas imágenes con la etiqueta de `SJLC_VERSION` (en `.env`).
3. Primera instalación: crear `.env` desde `.env.ejemplo`, colocar el certificado de origen de Cloudflare en `./certificados/`, `docker compose pull`, `./scripts/migrar.sh`, `./scripts/sembrar.sh produccion` y `docker compose up -d`.
4. Actualizar a una versión nueva: `./scripts/actualizar.sh vX.Y` (exige un respaldo de menos de 24 horas, aplica migraciones y reinicia).

El detalle completo, con la solución de problemas, está en el [manual de operación](docs/manual-operacion.md).

## Respaldos

- `./scripts/respaldar.sh` genera un respaldo comprimido de PostgreSQL en `/opt/respaldos/` (fuera del volumen y de git). Se programa a diario con cron; se conservan 14 días.
- `./scripts/restaurar.sh <archivo.dump>` restaura en un entorno de prueba (por defecto) o, con `--produccion`, sobre la base real.
- Se recomienda además una copia cifrada fuera del servidor. Un respaldo que no se ha probado restaurar no es un respaldo: ver el manual de operación.

## Datos y privacidad

El sistema guarda datos clínicos reales de pacientes: solo lo necesario, siempre sobre HTTPS, con acceso por rol y registro de cada consulta de historial. Los secretos (contraseñas, clave de sesión) viven únicamente en `.env`, que nunca se sube al repositorio. Las semillas de prueba contienen solo datos ficticios y **no deben cargarse en producción**.

## Licencia

Proyecto académico y de uso interno del Centro de Salud San José La Comunidad. Todos los derechos reservados por su autor.

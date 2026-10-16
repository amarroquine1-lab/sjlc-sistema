# Notas de cambios

## v1.1

### Novedades
- **Eliminar usuarios** (Administración → Usuarios, botón **Eliminar**, con confirmación escribiendo el nombre de usuario):
  - Un usuario **sin actividad** (nunca ingresó y sin registros a su nombre) se **borra por completo**.
  - Un usuario **con actividad** se **quita del sistema**: desaparece de la lista, no puede volver a entrar ni se puede reactivar, y su nombre se conserva en atenciones, recetas, bitácora y demás registros. Su nombre de usuario queda reservado.
  - No se puede eliminar la propia cuenta, la cuenta `sistema` ni al último administrador activo.
  - La casilla **Mostrar eliminados** los lista solo para consulta.
  - Cada eliminación queda en la bitácora (quién, cuándo y qué usuario). La regla se valida en la pantalla, en el servidor y en la base de datos.
- **Formulario de paciente y de emergencia** (Recepción): campos con más aire, tres columnas en laptop, y los botones de guardar siempre visibles al pie de la ventana. Se corrigieron los botones de opción (Mujer/Hombre) y la casilla "La persona no tiene DPI".

### Base de datos (se aplican con `./scripts/actualizar.sh v1.1`)
- `024_eliminar_usuarios`: permite borrar usuarios sin actividad, con reglas en un disparador de la base.
- `025_usuarios_eliminados`: columna `eliminado_el` en `usuarios` y eliminación lógica de los que tienen actividad; la bitácora anota ambas como `eliminar`.
- Son cambios aditivos: no modifican ni borran datos existentes.

### Correcciones
- Los scripts de `scripts/` ya no se detienen en producción cuando no se les indica el proyecto de Docker Compose (en 1.0 y 1.0.1 había que escribir `sjlc` al final: `./scripts/migrar.sh sjlc`).
- El manual de operación escribe `sjlc` en todos los comandos, para que sirvan en cualquier versión.

## v1.0.1
- El flujo de publicación de imágenes usa versiones vigentes de las acciones de GitHub, fijadas por commit.

## v1.0
- Primera versión: expediente único por paciente, recepción, colas por área, signos vitales, consulta médica y receta, nutrición, vacunación, farmacia, historial, bitácora, reportes, usuarios y roles.

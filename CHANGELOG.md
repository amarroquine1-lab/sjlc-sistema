# Notas de cambios

## v1.2.1

### Correcciones
- **Diálogos con campos de texto** (por ejemplo "Enviar al paciente" → Motivo): al escribir, el cursor saltaba al botón Cancelar y solo dejaba escribir una letra a la vez. Ahora, al abrir, el cursor queda en el primer campo y no se mueve mientras se escribe. Aplica a todos los diálogos del sistema (enviar, unir registros, eliminar usuario, entrega en farmacia, etc.), que comparten el mismo componente.

### Novedades
- **Pacientes que atiende otra persona** (tarjetas de "En atención ahora"): ahora se pueden abrir. Muestran, solo para consulta, el paciente, su código y número de atención, edad, tipo, área, quién lo atiende y desde qué hora. La tarjeta se ve clicable.
- **Solo Administración**, con confirmación en cada paso:
  - **Tomar atención**: el paciente pasa a su nombre (conserva la hora de inicio), respetando un paciente por área.
  - **Devolver a la cola**: con las mismas reglas del botón existente (no se permite si ya hay datos clínicos guardados).
  - Los roles de área solo ven el detalle. Ambas acciones quedan en la bitácora (quién, a quién se lo quitó y cuándo): `tomar_atencion` y `devolver_a_cola`.

### Base de datos (se aplica con `./scripts/actualizar.sh v1.2.1`)
- `027_bitacora_tomar_atencion`: agrega el evento `tomar_atencion` a la bitácora. No modifica ni borra datos.

## v1.2

### Novedades
- **Regla de atención por rol.** Administración puede tener un paciente en atención por área al mismo tiempo (por ejemplo, uno en Signos y otro en Doctor), nunca dos en la misma área. Los demás roles siguen atendiendo a un solo paciente a la vez.
- **Devolver a la cola.** Botón en el paciente en atención, en todas las áreas, con confirmación. El paciente regresa a la cola de esa misma área en su posición original (conserva su hora de llegada), en espera y sin contar como atención. Si ya se guardaron datos de ese paciente en esa área, no se permite y el mensaje explica el motivo. Queda en la bitácora (`devolver_a_cola`: quién, cuándo y desde qué área).
- **Aviso claro al llamar.** Si alguien con rol de área tiene un paciente abierto en otra área, la pantalla lo dice (paciente, número de atención y área), con un botón para ir a esa área, y el mensaje de "Ya tiene un paciente en atención" nombra al paciente y al área. Corrige la confusión de "Llamar siguiente" bloqueado mientras el panel decía que no había nadie en atención.

### Base de datos (se aplica con `./scripts/actualizar.sh v1.2`)
- `026_atencion_por_rol`: el índice único de "un paciente en atención por persona" pasa a ser por persona y área, un disparador mantiene "uno solo" para los roles que no son Administración, y se agrega el evento `devolver_a_cola` a la bitácora.
- No modifica ni borra datos existentes.

### Correcciones
- `probar-restauracion.sh` ya no tiene fijo el número de migraciones.

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

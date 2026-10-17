# Manual de usuario — Sistema de Expedientes Clínicos

**Centro de Salud San José La Comunidad, zona 10, Mixco** · Versión 1.0

Este manual explica, paso a paso y en lenguaje sencillo, cómo usa el sistema cada persona del centro. Las imágenes están en la carpeta `docs/capturas/` y se mencionan en cada sección. Los pacientes que aparecen en las imágenes son **ficticios**.

---

## 1. Lo que hay que saber antes de empezar

**Qué hace el sistema.** Cada persona que llega al centro tiene **un solo expediente** con un código permanente (por ejemplo `SJLC-000123`). Cada vez que viene, recepción abre una **atención** con su propio número (por ejemplo `A-004587`). La atención recorre las áreas (signos, doctor, nutrición, vacunación, farmacia) y el sistema guarda a qué hora entró y salió de cada una y quién lo atendió.

**Cómo se mueve un paciente.** Cada área tiene **una sola pantalla**: a la izquierda la **cola de espera** y a la derecha el **paciente que usted está atendiendo**. Al terminar, usted lo envía a la siguiente área con el botón **"Enviar a…"** o cierra la atención con **"Finalizar"**.

**Ingreso.** Escriba su usuario y su contraseña y presione **Ingresar** (imagen `01-ingreso.png`).

- Su usuario es la inicial de su nombre más su apellido, sin tildes (por ejemplo `rlopez`).
- La primera vez, o después de que un administrador le restablezca la contraseña, el sistema le pide **cambiarla**. Use mínimo 10 caracteres, que no lleve su usuario y que no sea una contraseña común.
- Si se equivoca 5 veces seguidas, la cuenta se bloquea 15 minutos. Un administrador puede desbloquearla antes.
- Si deja de usar el sistema 15 minutos, la sesión se cierra sola. Al terminar su turno, o si se va de la computadora, presione **Salir** (arriba a la derecha).

**Pantalla de inicio.** Después de ingresar verá "Hola, …" y las tarjetas de las áreas a las que usted tiene acceso (imagen `02-inicio-recepcion.png`). El botón **Inicio** de la barra de arriba siempre lo regresa aquí.

**Colores.** Cada área tiene su color (recepción azul marino, signos turquesa, doctor verde, nutrición naranja, vacunación uva, farmacia coral). El botón "Enviar a…" toma el color del área a la que va el paciente.

**Si algo sale mal.** Los mensajes están en español y dicen qué hacer. Si un mensaje no se entiende o el problema sigue, avise a la persona de soporte del centro.

---

## 2. Recepción

Recepción registra a los pacientes, abre las atenciones, imprime el ticket y atiende las emergencias.

### 2.1 Buscar a un paciente

1. En **Recepción**, escriba en la casilla de búsqueda **una** de estas cosas: el código (`SJLC-000123`), el DPI/CUI, parte del nombre o apellido (no importan las tildes ni las mayúsculas), la fecha de nacimiento o el DPI del encargado de un menor.
2. Presione **Buscar**.
3. Elija a la persona de la lista. Verá su ficha, sus pendientes (por ejemplo "2.ª dosis de pentavalente") y sus datos (imagen `03-recepcion-paciente.png`).

### 2.2 Registrar un paciente nuevo

1. Presione **Nuevo paciente** (imagen `04-recepcion-nuevo.png`).
2. Llene nombres, apellidos, fecha de nacimiento y sexo. Guatemala, Mixco y zona 10 ya vienen escritos; cámbielos si el paciente vive en otro lugar.
3. Escriba el DPI/CUI (13 números). Si no lo tiene, marque que no tiene CUI.
4. **Si es menor de edad**, aparece el apartado del **encargado**: nombre, DPI y parentesco. Así se puede buscar al niño por el DPI de su madre o padre.
5. Si existe un paciente parecido (mismo nombre y fecha de nacimiento), el sistema le avisa **antes** de guardar. Revise: si es la misma persona, use el registro que ya existe; si es otra, confirme que desea registrarla.
6. Guarde. El sistema le asigna el código `SJLC-…`, que es permanente.

Para corregir datos de un paciente existente, búsquelo y use la opción de editar. Los cambios quedan registrados.

### 2.3 Abrir la atención y el ticket

1. Con el paciente seleccionado, en **Abrir una atención** elija el tipo: consulta general, vacunación, nutrición directa, planificación familiar o emergencia.
2. Confirme en la ventana ("¿Abrir una atención de … para …?").
3. Presione **Imprimir ticket** (imagen `06-ticket.png`). El ticket sale en la impresora de 80 mm desde el navegador, con el código del paciente, el número de atención, la hora, el tipo y un código de barras. No lleva DPI ni datos sensibles. El ticket es opcional: si no hay papel, el paciente igual puede ser atendido.

El paciente pasa a la cola de **Signos**. La excepción son las emergencias, que pasan directo al doctor.

### 2.4 Emergencia

1. Presione **Emergencia** (imagen `05-recepcion-emergencia.png`).
2. Escriba solo lo que sepa: sexo y edad aproximada son obligatorios; el nombre, si se conoce.
3. Confirme **"¿Registrar la emergencia?"**. El paciente pasa de inmediato al doctor, con prioridad sobre los demás.
4. Más tarde, el registro aparece en la lista de **datos incompletos**. Cuando tenga los datos del paciente, complételos. Si la persona ya tenía expediente, el sistema avisa y se pueden **unir** los registros.

### 2.5 Unir dos registros duplicados

Si una persona quedó registrada dos veces: abra uno de los registros, presione **Unir con otro registro**, elija el otro, escriba el **motivo** y confirme con **Unir registros**. Todo el historial queda en un solo expediente y la unión se anota en la bitácora.

### 2.6 Cuando un paciente se retira

Si el paciente se fue sin terminar, abra la atención y presione **Se retiró**, y confirme con **Sí, se retiró**. La atención queda cerrada con ese estado.

---

## 3. Signos vitales

1. Entre a **Signos**. A la izquierda está la cola (imagen `07-signos-cola.png`).
2. Presione **Llamar siguiente** (llama al que sigue según el orden: las emergencias primero y después por hora de llegada) o **Atender** junto al nombre de un paciente específico.
3. Llene lo que haya tomado (imagen `08-signos-atencion.png`): peso **en libras**, talla en cm, temperatura en °C, presión alta y baja, pulso y saturación de oxígeno. El sistema calcula el IMC. No hace falta llenar todo.
4. Si ve señales de peligro, márquelas y escriba el detalle.
5. Presione **Guardar signos**. Si un número está fuera de lo posible, el mensaje aparece junto al campo.
6. Presione **Enviar a…** y elija a dónde va: **Doctor**, **Nutrición** o **Vacunación**. El sistema le pregunta "¿Enviar a … (A-…) a …?" (imagen `09-signos-enviar.png`). Puede escribir un **motivo** breve, opcional.
7. Confirme. El paciente pasa a la cola del área elegida.

**Si llamó al paciente equivocado:** presione **Devolver a la cola** (junto al nombre del paciente) y confirme. El paciente vuelve a su lugar en la cola de esa área, con su hora de llegada original, y usted queda libre para llamar a otro. Lo que haya escrito sin guardar se descarta. Si ya guardó datos de ese paciente en el área, el sistema no permite devolverlo. Esto aplica igual en todas las áreas.

**Cuántos pacientes a la vez:** cada persona atiende a un paciente a la vez. Administración puede tener uno en atención en cada área (por ejemplo, uno en Signos y otro en Doctor), pero nunca dos en la misma.

Si se equivoca en un dato, vuelva a guardar el valor correcto: el anterior no se borra, queda como historial.

---

## 4. Doctor

1. Entre a **Doctor**. Con **Llamar siguiente** o **Atender** tome a un paciente (imagen `10-doctor-cola.png`). Si hay dos doctores, cada uno ve la misma cola y el sistema no deja que dos tomen al mismo paciente.
2. Arriba verá los **signos de hoy**, las **visitas anteriores** y los pendientes del paciente.
3. En **Consulta**, escriba el motivo de la consulta, la historia, el diagnóstico (puede agregar varios y el código CIE-10 es opcional), la conducta o tratamiento, los problemas identificados y, si aplica, a dónde se refiere al paciente. Presione **Guardar cambios**.
4. En **Receta**, presione **Agregar medicamento** y escriba medicamento, presentación, cantidad e indicaciones. El sistema sugiere lo que ya se escribió antes, pero puede escribir cualquier texto. Presione **Guardar receta** (imagen `11-doctor-atencion.png`).
5. En **Próximo control**, anote lo que queda pendiente (por ejemplo "control en 1 mes") con la fecha sugerida, si la hay.
6. Para terminar, use **Enviar a…**:
   - **Enviar a Farmacia**, si el paciente lleva receta. Escriba un motivo si quiere (imagen `12-doctor-enviar.png`).
   - **Enviar a Nutrición** o **Enviar a Vacunación**, por ejemplo si es un niño.
   - **Finalizar**, si no hay receta.

**Regla importante:** si hay una **receta sin entregar**, el paciente **debe pasar por Farmacia** y el botón Finalizar desaparece; "Enviar a Farmacia" queda como acción principal. Si todavía no guardó la receta y presiona **Enviar a Farmacia**, el sistema le pide primero agregarla. Para **Finalizar** es necesario haber guardado la consulta; para enviar a otra área no.

---

## 5. Nutrición

1. Entre a **Nutrición**, tome al paciente con **Llamar siguiente** o **Atender**.
2. Revise los signos de hoy y escriba la **evaluación nutricional**: diagnóstico nutricional, código CIE-10 si lo tiene y observaciones. Presione **Guardar evaluación** (imagen `15-nutricion-atencion.png`).
3. Si receta suplementos (hierro, zinc, etc.), use **Agregar medicamento** y **Guardar receta**. Si no corresponde, use **Dejar sin receta**.
4. Deje el **próximo control** si hace falta.
5. Termine con **Enviar a…**: **Doctor**, **Vacunación** o **Farmacia**, o **Finalizar**.

Igual que con el doctor: si quedó una receta sin entregar, no se puede finalizar aquí; use **Enviar a Farmacia**. Para **Finalizar** se necesita la evaluación guardada.

---

## 6. Vacunación

1. Entre a **Vacunación** y tome al paciente. Verá los signos de hoy, lo aplicado en esta visita y el **esquema anterior** del paciente.
2. En **Registrar vacuna**, escriba el **nombre de la vacuna** (el sistema sugiere las que ya se usaron y las del catálogo, pero acepta cualquier nombre), la **dosis** (1, 2, 3…), el **lote** y la fecha de aplicación. Presione **Registrar vacuna** (imagen `16-vacunacion-atencion.png`).
3. No se puede registrar dos veces la misma dosis de la misma vacuna para el mismo paciente.
4. Si la vacuna se anotó mal, corríjala: queda la versión nueva y el rastro de la anterior.
5. Deje el **próximo control** si corresponde (por ejemplo "2.ª dosis en 2 meses"). La próxima vez que recepción busque al paciente, verá ese pendiente.
6. Termine con **Enviar a…** (**Doctor**, **Nutrición** o **Farmacia**) o **Finalizar**. Para **Finalizar** se necesita al menos una vacuna registrada; si el paciente no fue vacunado, pida a un administrador que cierre la atención.

---

## 7. Farmacia

1. Entre a **Farmacia**. Solo llegan pacientes **con receta**. Tome al paciente con **Llamar siguiente** o **Atender**.
2. Verá los datos mínimos del paciente y los **medicamentos recetados**, con la cantidad y las indicaciones (imagen `13-farmacia-atencion.png`).
3. En **Entregado**, escriba la cantidad que realmente entrega de cada medicamento (0 si no se entregó). Si entrega menos de lo recetado, la **observación** es obligatoria (por ejemplo "sin existencia"). No se puede entregar más de lo recetado.
4. Si quiere, escriba el nombre de quien recibe.
5. Presione **Entregar y finalizar atención**. El sistema pregunta "¿Registrar la entrega de medicamentos y finalizar la atención de … (A-…)?" (imagen `14-farmacia-confirmar.png`). Confirme con **Entregar y finalizar**.

Con eso se registra la entrega, se asigna el número de orden y la atención queda **finalizada**, todo en un solo paso. Farmacia es siempre el último paso cuando hay receta.

---

## 8. Historial del paciente (todas las áreas)

Todos los usuarios pueden consultar el historial completo de un paciente: **Historial** en la tarjeta de inicio, o **Ver historial** desde la ficha (imagen `22-historial-paciente.png`). Para cada visita se ve el recorrido por las áreas (hora de llegada, quién atendió, cuánto esperó y el motivo del envío si lo hubo), los signos, la consulta, la receta y su entrega, la evaluación nutricional, las vacunas y los pendientes.

Cada vez que alguien consulta un historial, queda anotado en la bitácora.

---

## 9. Administradores

### 9.1 Usuarios (imagen `18-usuarios.png`)

- **Crear usuario:** escriba nombres, apellidos y elija el rol. El sistema genera el usuario (inicial + apellido) y una **contraseña temporal que se muestra una sola vez**: anótela y entréguela en persona. La persona deberá cambiarla al ingresar.
- **Restablecer contraseña:** genera otra temporal. Úsela cuando alguien olvidó la suya (no hay recuperación por correo).
- **Desbloquear:** libera una cuenta bloqueada por intentos fallidos.
- **Desactivar / Activar:** una persona que ya no trabaja en el centro se desactiva; no se borra, para conservar el rastro.
- **Eliminar:** sirve para cualquier cuenta. Pide escribir el nombre de usuario para confirmar y queda anotado en la bitácora. El mensaje de confirmación dice qué va a pasar: si la cuenta **nunca tuvo actividad** (nunca ingresó y no tiene registros) *se borrará por completo*; si **ya tiene actividad**, *se quitará del sistema y sus registros se conservan*: desaparece de la lista, no puede volver a entrar ni se puede reactivar, y su nombre sigue en las atenciones, recetas y demás registros donde aparece. No se puede eliminar su propia cuenta ni al último administrador activo (el botón aparece apagado y al tocarlo explica por qué). Para consultar a los eliminados marque **Mostrar eliminados**: salen solo para consulta, sin acciones.

### 9.2 Bitácora (imagen `19-bitacora.png`)

Muestra quién hizo qué, cuándo y desde qué dirección: ingresos (buenos y fallidos), cambios de pacientes y atenciones, uniones, contraseñas, consultas de historial. Se puede filtrar y abrir cada registro con **Ver cambio** para ver el valor anterior y el nuevo.

### 9.3 Estado de las colas (imagen `20-colas.png`)

Muestra cuántos pacientes esperan en cada área, desde qué hora y quién está atendiendo. Sirve para ver cuellos de botella.

### 9.4 Reportes (imagen `21-reportes.png`)

1. Elija el **reporte**, las fechas **Desde** y **Hasta**, y presione **Generar reporte**.
2. Reportes disponibles: atenciones por día, mes y tipo; pacientes por área; tiempos de espera promedio por área; medicamentos entregados; vacunas aplicadas; registro diario de consultas.
3. Presione **Imprimir**. Sale en tamaño carta, legible en blanco y negro, con el encabezado del centro, los filtros y la fecha.

### 9.5 Cierre del día

A las 20:00 las atenciones que siguen abiertas pasan solas al estado **no concluida**. Un administrador también puede ejecutar el cierre manualmente.

---

## 10. Estados de una atención

| Estado | Significa |
|---|---|
| En espera | Llegó a un área y aún no lo llaman. |
| En atención | Alguien lo está atendiendo ahora. |
| Enviado | Ya salió de un área y espera en la siguiente. |
| Finalizada | La atención terminó. |
| Se retiró | Recepción marcó que el paciente se fue. |
| No concluida | Quedó abierta al cierre del día. |

---

## 11. Preguntas frecuentes

- **No encuentro a un paciente.** Pruebe con otra forma de búsqueda (DPI, código, solo el apellido). Si no existe, regístrelo.
- **El botón Finalizar no aparece.** El paciente tiene una receta sin entregar: envíelo a Farmacia.
- **Me dice que debo registrar la consulta, la evaluación o la vacuna.** Es necesario para finalizar en esa área. Guárdela y vuelva a intentar.
- **"Ya tiene un paciente en atención".** Termine con el paciente actual (envíelo o finalícelo) antes de llamar a otro.
- **La sesión se cerró.** Se cierra sola a los 15 minutos sin uso. Vuelva a ingresar; lo que ya guardó sigue ahí. Lo que no alcanzó a guardar hay que escribirlo otra vez.
- **Me equivoqué en un dato clínico.** No se borra nada: guarde la corrección y quedará la versión nueva con el rastro de la anterior.
- **La impresora no imprime el ticket.** Revise papel y conexión; el paciente igual puede ser atendido sin ticket.
- **Olvidé mi contraseña.** Pida a un administrador que la restablezca.

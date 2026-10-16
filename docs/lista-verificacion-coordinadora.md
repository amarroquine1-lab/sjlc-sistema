# Lista de verificación para la coordinadora

Para repasar con calma en el entorno de pruebas (`pruebas.centrodesalud-sjlc.org`, datos ficticios) antes de usar el sistema con pacientes reales. Marque lo que funciona y anote lo que no.

## 1. Ingreso y sesión
- [ ] Ingresar con usuario y contraseña; el sistema pide cambiar la contraseña temporal.
- [ ] Equivocarse 5 veces en la contraseña bloquea la cuenta 15 minutos.
- [ ] Dejar la pantalla sin tocar 15 minutos cierra la sesión y avisa.
- [ ] El botón "Salir" está visible y cierra la sesión.

## 2. Recepción
- [ ] Registrar un paciente nuevo (adulto): recibe código `SJLC-######`.
- [ ] Registrar un menor: pide al encargado (nombre, parentesco, DPI).
- [ ] Buscar por código, DPI, nombre (sin tildes ni mayúsculas) y fecha de nacimiento.
- [ ] Al registrar un nombre y fecha parecidos a otro, avisa de un posible duplicado.
- [ ] Unir dos registros repetidos (pide el motivo).
- [ ] Abrir una atención, elegir el tipo e imprimir el ticket (papel de 80 mm, con código de barras).
- [ ] Emergencia: registro rápido y aparece en la lista de datos incompletos.
- [ ] Marcar "se retiró" a un paciente que esperaba.

## 3. Cada área (con su propio usuario)
- [ ] **Signos vitales:** llamar siguiente, anotar signos, corregir un dato, enviar al doctor.
- [ ] **Doctor:** ver signos y visitas anteriores, registrar consulta y diagnóstico, receta (buscar medicamento), próximo control, enviar a farmacia/nutrición/vacunación o finalizar.
- [ ] **Nutrición:** evaluación, receta de suplementos, envío a farmacia.
- [ ] **Vacunación:** registrar dosis con lote y fecha; una vacuna directa no pasa por el doctor.
- [ ] **Farmacia:** solo aparecen pacientes con receta; registrar lo entregado y lo que falta con su motivo; finalizar.
- [ ] La cola de cada área se actualiza sola; las emergencias pasan primero.
- [ ] Dos doctores no pueden llamar al mismo paciente.

## 4. Historial y trazabilidad
- [ ] El historial de un paciente muestra todas sus visitas, quién lo atendió y a qué hora.
- [ ] Los pendientes ("control en 1 mes") aparecen al buscar al paciente.

## 5. Administración (solo administradores)
- [ ] Crear un usuario (la contraseña temporal se muestra una sola vez), desactivarlo, restablecer su contraseña.
- [ ] Bitácora: filtrar por usuario, acción y fecha; ver el cambio antes y después.
- [ ] Estado de las colas: ver cuántos esperan en cada área.
- [ ] Reportes: atenciones, pacientes por área, tiempos de espera, medicamentos entregados, vacunas, registro diario de consultas; imprimir en carta.
- [ ] Un usuario que no es administrador no ve estas pantallas.

## 6. Preguntas pendientes (ver también `preguntas-coordinadora.pdf`)
- [ ] Campos exactos de la evaluación nutricional y del registro de vacunación (los actuales son una propuesta).
- [ ] Numeración de las órdenes de farmacia (continua, diaria o anual) y cómo se registra quién recibe.
- [ ] Qué formatos del Ministerio deben salir del sistema y con qué columnas.
- [ ] ¿El doctor puede finalizar una atención con receta sin pasar por farmacia?
- [ ] ¿Qué datos del paciente necesita ver cada área en el historial (domicilio, teléfono, DPI del encargado)?
- [ ] Lista de colonias y sectores de la zona 10.

## 7. Pantallas
- [ ] Todo se lee bien en la computadora de cada área (1366×768) y en la tablet.
- [ ] Las letras son legibles y los botones se alcanzan sin dificultad.

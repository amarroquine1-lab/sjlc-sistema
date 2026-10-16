# Sistema de diseño: Expedientes Clínicos SJLC

Interfaz moderna, cálida y profesional para personal de salud con poca experiencia tecnológica. Escritorio primero (1366×768), funcional en tablet; el móvil es secundario. Con la aprobación de Abner (cambio de la sección 13 de la especificación) se permite más color, el logo del MSPAS y las ilustraciones propias.

## Principios
1. **Una pantalla por área**: cola a la izquierda, paciente a la derecha. Máximo 3 clics en las tareas frecuentes.
2. **El color es información**: cada área tiene el suyo y lo usa en su pantalla, su cola, sus etiquetas y sus botones; el destino de un envío usa el color del destino.
3. **Lenguaje local**: Expediente, Atención, Signos, Receta, Encargado, DPI/CUI.
4. **Cada acción que guarda o envía pide confirmación que nombra lo afectado** y luego muestra un mensaje breve de éxito o error.
5. Los íconos de lucide son pequeños y siempre llevan texto; las ilustraciones son decorativas y el texto dice lo mismo.
6. **Salir** e **Inicio** siempre visibles. Los textos de los botones van en una sola línea.
7. Contraste AA en todo texto (se verifica con pruebas automáticas de accesibilidad).

## Color (`src/estilos/tokens.css`)
Fondo cálido (crema) y azul marino del MSPAS como ancla; un color por área, con su tono suave para fondos. Todos los colores de área dan al menos 5,2:1 con texto blanco y 4,6:1 sobre su tono suave.
| Área | Color | Suave | Contraste con blanco |
|---|---|---|---|
| Recepción (y ancla institucional) | marino `#12395f` | `#e6ecf3` | 11,8:1 |
| Signos vitales | turquesa `#0a6f82` | `#ddf2f5` | 5,8:1 |
| Doctor | verde `#1e7a47` | `#e1f3e8` | 5,3:1 |
| Nutrición | naranja `#b14a00` | `#fce9d6` | 5,5:1 |
| Vacunación | uva `#7b2c78` | `#f4e3f2` | 8,5:1 |
| Farmacia | coral `#b93a28` | `#fce5df` | 5,9:1 |
| Emergencia | rojo `#b3261e` | `#fbe3e1` | 6,5:1 |

Acentos con energía, solo para ilustraciones y detalles (no para texto): amarillo maíz `#f2b705` (también el contador de la cola, con texto oscuro), turquesa vivo `#17b3c4`, coral vivo `#f26b50`, celeste de la bandera `#4997d0`.
Neutros: crema `#fbf7ef`, hueso `#f4eee2`, líneas `#e6ddcb`, tinta `#1f2933` (13,8:1 sobre crema), tinta suave `#55606b` (6:1).
Cada pantalla declara su área con `data-area` y las variables `--area` y `--area-fondo` hacen el resto; el destino de un botón de envío se declara con `data-destino`.

## Tipografía (alojada con `@fontsource`; sin Google Fonts ni CDN)
- **Outfit** (600, 700, 800) para títulos: grandes y con peso. Título de pantalla 38 px, secciones 26 y 21 px.
- **Plus Jakarta Sans** (400, 500, 700) para el texto; base 17 px, interlineado 1,55.
- **Atkinson Hyperlegible Mono** solo para códigos de paciente y de atención, DPI y bloques de datos, con cifras tabulares.

## Forma y profundidad
Radio de 8 px en campos y botones, 14 px en tarjetas. Bordes cálidos de 1 px y sombras bajas y neutras (sin tinte azul); sin degradados en el cuerpo de la interfaz. Etiquetas de estado rectas (4 px), no píldoras. Controles de 48 px.

## Ilustraciones (`src/ilustraciones/Ilustraciones.tsx`)
SVG propios de línea simple (trazo marino de 3 px) con la paleta: **termómetro** (signos), **estetoscopio** (doctor), **báscula** (nutrición), **vacuna** (vacunación), **frasco** (farmacia), **familia en espera** (recepción y estados vacíos) y la **fachada del centro con columnas azules y la comunidad** (portada del ingreso). Los colores salen de clases y del área, porque la CSP no admite estilos en línea.

## Componentes
| Componente | Reglas |
|---|---|
| Barra superior | Fija. Logo del MSPAS, nombre del centro, usuario con su área en su color, hora, **Inicio** y **Salir**; filete inferior de 6 px en el color del área de la pantalla |
| Inicio | Una tarjeta por área con su ilustración y su color; consultas y administración como filas sencillas con ícono pequeño |
| Ingreso | Pantalla dividida: portada marino con el logo y la fachada del centro; formulario limpio con una ayuda de una línea |
| Pantalla de área | Encabezado con la ilustración y el título en el color del área; cola con contador amarillo; paciente con encabezado fijo en el tono suave del área; barra "Enviar a…" fija al pie, cada destino con su color |
| `Boton` | Color del área (o del destino). Primario relleno, secundario con borde, peligro rojo; hover, presionado, foco y deshabilitado visibles. Una sola línea |
| `Campo` | Etiqueta visible arriba, ayuda y error asociados, foco con el color del área |
| `Mensaje` | Ícono + color + texto; `role="status"` o `role="alert"` |
| `Dialogo` | Filete superior del color del área o destino; foco atrapado; texto que nombra lo afectado |
| `Tabla` | Encabezado con filete marino de 3 px; filas de 52 px; cifras tabulares |
| `Vacio` | Familia en espera + qué hacer a continuación |

## Impresión
El logo del MSPAS va en blanco y negro (`mspas-bn.png`, tramado para impresora térmica) en el ticket de 80 mm, en los reportes en carta y en el historial impreso. Los reportes son en blanco y negro; ningún color de área se imprime.

## Reglas de implementación
- Nada de estilos en línea: la CSP los bloquea. Solo clases y atributos `data-*`.
- Los textos de la interfaz viven en español guatemalteco; los mensajes del backend se muestran tal cual.
- El frontend no recalcula edades, IMC ni tiempos.
- La sesión expira a los 15 minutos de inactividad: la interfaz avisa 2 minutos antes.

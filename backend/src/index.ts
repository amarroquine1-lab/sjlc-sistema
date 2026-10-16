import { conexionApp } from "./bd/conexion.js";
import { crearApp } from "./app.js";
import { programarCierreDiario } from "./modulos/cola/servicio.js";
import { leerConfiguracion } from "./configuracion.js";

const config = leerConfiguracion();
const pool = conexionApp();
const { app } = crearApp(config, pool);

if (config.cierreAutomatico) programarCierreDiario(pool, config.horaCierre, (m) => console.log(m));
else console.log("Cierre automático del día desactivado (CIERRE_AUTOMATICO=no).");

const servidor = app.listen(config.puerto, () => {
  console.log(`Backend escuchando en el puerto ${config.puerto}`);
});

function cerrar(): void {
  servidor.close(() => void pool.end().finally(() => process.exit(0)));
}
process.on("SIGTERM", cerrar);
process.on("SIGINT", cerrar);

import type { RegistroRutas } from "../../seguridad/rutas.js";
import type { Dependencias } from "../../middleware/seguridad.js";

// Guatemala no usa horario de verano: el desfase es fijo (-06:00)
function horaGuatemala(): string {
  const texto = new Intl.DateTimeFormat("sv-SE", { timeZone: "America/Guatemala", dateStyle: "short", timeStyle: "medium" }).format(new Date());
  return `${texto.replace(" ", "T")}-06:00`;
}

export function rutasSistema(registro: RegistroRutas, _deps: Dependencias): void {
  registro.agregar({
    metodo: "get", ruta: "/api/salud", acceso: "publica",
    manejador: (_req, res) => { res.json({ estado: "ok", hora: horaGuatemala() }); },
  });
}

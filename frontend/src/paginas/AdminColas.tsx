import { useCallback, useEffect, useState } from "react";
import { api } from "../api/cliente";
import type { EstadoColas } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Mensaje } from "../componentes/Mensaje";
import { Tabla } from "../componentes/Tabla";
import { capitalizar } from "../texto";

// Foto de las colas de todas las áreas; se actualiza sola.
export function AdminColas() {
  const [e, setE] = useState<EstadoColas | null>(null);
  const [error, setError] = useState<string | null>(null);
  const cargar = useCallback(async (auto: boolean) => {
    try { setE(await api.get<EstadoColas>("/api/administracion/colas", { automatica: auto })); setError(null); }
    catch (err) { if (!auto) setError(err instanceof Error ? err.message : "No se pudo cargar."); }
  }, []);
  useEffect(() => { void cargar(false); const t = window.setInterval(() => { if (document.visibilityState === "visible") void cargar(true); }, 5000); return () => window.clearInterval(t); }, [cargar]);
  return (
    <>
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <h1>Estado de las colas</h1>
        {error && <Mensaje tipo="error">{error}</Mensaje>}
        {e && <>
          <p>{e.atenciones_abiertas} atenciones abiertas · {e.sesiones_activas} sesiones activas.</p>
          <Tabla clave={(f) => f.area} filas={e.areas} columnas={[
            { titulo: "Área", celda: (f) => capitalizar(f.area) },
            { titulo: "Esperando", celda: (f) => f.en_espera },
            { titulo: "En atención", celda: (f) => f.en_atencion },
            { titulo: "Espera más larga", celda: (f) => `${f.espera_maxima_minutos} min` },
            { titulo: "Atiende", celda: (f) => f.atendiendo || "—" },
          ]} />
        </>}
      </main>
    </>
  );
}

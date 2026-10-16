import { useState } from "react";
import { api } from "../api/cliente";
import type { ControlVista } from "../api/tipos";
import { Boton } from "./Boton";
import { Campo } from "./Campo";
import { Mensaje } from "./Mensaje";
import { Seleccion } from "./Seleccion";

// Pendientes para la próxima visita. Se agregan; los cumple el área correspondiente en una visita futura.
export function ProximoControl({ idAtencion, controles, alGuardar }: { idAtencion: number; controles: ControlVista[]; alGuardar: () => void }) {
  const [area, setArea] = useState("doctor");
  const [descripcion, setDescripcion] = useState("");
  const [fecha, setFecha] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const agregar = async () => {
    setError(null);
    if (!descripcion.trim()) { setError("Escriba qué queda pendiente (por ejemplo: control en 1 mes)."); return; }
    setCargando(true);
    try {
      await api.post(`/api/atenciones/${idAtencion}/proximos-controles`, { area, descripcion: descripcion.trim(), fecha_sugerida: fecha || null });
      setDescripcion(""); setFecha(""); alGuardar();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo guardar el pendiente."); }
    finally { setCargando(false); }
  };

  return (
    <section aria-label="Próximo control" className="bloque">
      <h3>Próximo control</h3>
      {controles.length > 0 && <ul>{controles.map((c) => <li key={c.id_proximo_control}>{c.descripcion} · {c.area}{c.fecha_sugerida ? ` · ${c.fecha_sugerida}` : ""}</li>)}</ul>}
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      <div className="rejilla-formulario">
        <Seleccion etiqueta="Área" value={area} onChange={(e) => setArea(e.target.value)} opciones={[{ valor: "doctor", texto: "Doctor" }, { valor: "nutricion", texto: "Nutrición" }, { valor: "vacunacion", texto: "Vacunación" }]} />
        <Campo etiqueta="Fecha sugerida (opcional)" type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} />
        <div className="ancho-completo"><Campo etiqueta="Qué queda pendiente" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} maxLength={200} autoComplete="off" /></div>
      </div>
      <Boton type="button" variante="secundario" onClick={() => void agregar()} cargando={cargando}>Agregar pendiente</Boton>
    </section>
  );
}

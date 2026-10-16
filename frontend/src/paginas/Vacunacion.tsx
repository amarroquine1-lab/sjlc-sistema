import { type FormEvent, useEffect, useRef, useState } from "react";
import { api } from "../api/cliente";
import type { PanelAtencion, VacunaAplicadaVista } from "../api/tipos";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Mensaje } from "../componentes/Mensaje";
import { ProximoControl } from "../componentes/ProximoControl";
import { PantallaArea } from "./PantallaArea";

const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

function RegistroVacuna({ idAtencion, alGuardar }: { idAtencion: number; alGuardar: () => void }) {
  const [sugerencias, setSugerencias] = useState<string[]>([]);
  const temporizador = useRef<number | undefined>(undefined);
  const [f, setF] = useState({ vacuna: "", dosis: "1", lote: "", fecha: hoy() });
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  useEffect(() => () => window.clearTimeout(temporizador.current), []);
  // Sugiere lo ya escrito antes y las vacunas del catálogo; acepta cualquier texto.
  const sugerir = (texto: string) => {
    window.clearTimeout(temporizador.current);
    if (texto.trim().length < 2) { setSugerencias([]); return; }
    temporizador.current = window.setTimeout(() => {
      api.get<{ datos: string[] }>(`/api/vacunas/sugerencias?q=${encodeURIComponent(texto.trim())}`).then((r) => setSugerencias(r.datos)).catch(() => undefined);
    }, 400);
  };

  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setExito(null);
    if (!f.vacuna.trim()) { setError("Escriba la vacuna."); return; }
    if (!/^\d{1,2}$/.test(f.dosis.trim()) || Number(f.dosis) < 1) { setError("La dosis es un número (1, 2, 3…)."); return; }
    setCargando(true);
    try {
      await api.post(`/api/atenciones/${idAtencion}/vacunas`, { nombre_vacuna: f.vacuna.trim(), numero_dosis: Number(f.dosis), lote: f.lote.trim() || null, fecha_aplicacion: f.fecha });
      setExito("Vacuna registrada."); setF((a) => ({ ...a, vacuna: "", dosis: "1", lote: "" })); alGuardar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar la vacuna."); }
    finally { setCargando(false); }
  };

  return (
    <form onSubmit={enviar} noValidate aria-label="Registrar vacuna">
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      {exito && <Mensaje tipo="exito">{exito}</Mensaje>}
      <div className="rejilla-formulario">
        <datalist id="sug-vacuna">{sugerencias.map((x) => <option key={x} value={x} />)}</datalist>
        <Campo etiqueta="Vacuna" list="sug-vacuna" value={f.vacuna} maxLength={120} autoComplete="off" ayuda="Escriba el nombre; se sugieren las ya usadas."
          onChange={(e) => { setF((a) => ({ ...a, vacuna: e.target.value })); sugerir(e.target.value); }} />
        <Campo etiqueta="Dosis" inputMode="numeric" value={f.dosis} onChange={(e) => setF((a) => ({ ...a, dosis: e.target.value }))} autoComplete="off" />
        <Campo etiqueta="Lote" value={f.lote} onChange={(e) => setF((a) => ({ ...a, lote: e.target.value }))} maxLength={40} autoComplete="off" />
        <Campo etiqueta="Fecha de aplicación" type="date" value={f.fecha} max={hoy()} onChange={(e) => setF((a) => ({ ...a, fecha: e.target.value }))} />
      </div>
      <Boton type="submit" cargando={cargando}>Registrar vacuna</Boton>
    </form>
  );
}

const lista = (v: VacunaAplicadaVista[], vacia: string) => v.length === 0 ? <p>{vacia}</p> : (
  <ul className="lista sin-vinetas">{v.map((x) => <li key={x.id_vacuna_aplicada}><strong>{x.nombre_vacuna}</strong> · dosis {x.numero_dosis} · {x.fecha_aplicacion}{x.lote ? ` · lote ${x.lote}` : ""}</li>)}</ul>
);

export function Vacunacion() {
  return (
    <PantallaArea clave="vacunacion" titulo="Vacunación" mostrarSignos
      panelDelArea={(panel: PanelAtencion, recargar) => {
        const id = panel.atencion.id_atencion;
        const e = panel.especifico;
        return (
          <>
            <h3>Aplicadas en esta visita</h3>
            {lista(e?.aplicadas ?? [], "Todavía no hay vacunas registradas en esta visita.")}
            <h3>Registrar vacuna</h3>
            <RegistroVacuna key={`v-${id}`} idAtencion={id} alGuardar={() => void recargar()} />
            <h3>Esquema anterior del paciente</h3>
            {lista(e?.esquema_previo ?? [], "Sin vacunas registradas antes en el sistema.")}
            <ProximoControl key={`p-${id}`} idAtencion={id} controles={e?.proximos_controles ?? []} alGuardar={() => void recargar()} />
          </>
        );
      }} />
  );
}

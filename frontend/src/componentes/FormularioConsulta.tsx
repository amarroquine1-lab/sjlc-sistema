import { Plus, Trash2 } from "lucide-react";
import { type FormEvent, useState } from "react";
import { api } from "../api/cliente";
import type { Clinico } from "../api/tipos";
import { AreaTexto } from "./AreaTexto";
import { Boton } from "./Boton";
import { Campo } from "./Campo";
import { Mensaje } from "./Mensaje";
import { Seleccion } from "./Seleccion";

interface Dx { descripcion: string; cie: string }

// Consulta médica: motivo, historia, diagnósticos (con código CIE-10 opcional), conducta y problemas identificados.
export function FormularioConsulta({ idAtencion, inicial, esMujer, alGuardar }: { idAtencion: number; inicial: Clinico["consulta"]; esMujer: boolean; alGuardar: () => void }) {
  const [f, setF] = useState({
    tipo: inicial?.tipo_consulta ?? "primera", motivo: inicial?.motivo_consulta ?? "", historia: inicial?.historia_enfermedad ?? "",
    semana: inicial?.semana_gestacion?.toString() ?? "", conducta: inicial?.conducta_tratamiento ?? "", problemas: inicial?.problemas_identificados ?? "",
    referido: inicial?.referido_a ?? "",
  });
  const [dx, setDx] = useState<Dx[]>(inicial?.diagnosticos.length ? inicial.diagnosticos.map((d) => ({ descripcion: d.descripcion_diagnostico, cie: d.codigo_cie10 ?? "" })) : [{ descripcion: "", cie: "" }]);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [cargando, setCargando] = useState(false);
  const set = (k: string, v: string) => { setF((a) => ({ ...a, [k]: v })); setExito(false); };
  const setDxi = (i: number, k: keyof Dx, v: string) => { setDx((a) => a.map((x, j) => (j === i ? { ...x, [k]: v } : x))); setExito(false); };

  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (!f.motivo.trim()) { setError("Escriba el motivo de la consulta."); return; }
    const diagnosticos = dx.filter((d) => d.descripcion.trim()).map((d) => ({ descripcion_diagnostico: d.descripcion.trim(), codigo_cie10: d.cie.trim() || null }));
    if (f.semana.trim() && !/^\d{1,2}$/.test(f.semana.trim())) { setError("La semana de gestación es un número entre 1 y 42."); return; }
    setCargando(true);
    try {
      await api.put(`/api/atenciones/${idAtencion}/consulta`, {
        tipo_consulta: f.tipo, motivo_consulta: f.motivo.trim(), historia_enfermedad: f.historia.trim() || null,
        semana_gestacion: f.semana.trim() ? Number(f.semana) : null, conducta_tratamiento: f.conducta.trim() || null,
        problemas_identificados: f.problemas.trim() || null, referido_a: f.referido.trim() || null, diagnosticos,
      });
      setExito(true); alGuardar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la consulta."); }
    finally { setCargando(false); }
  };

  return (
    <form onSubmit={enviar} noValidate aria-label="Consulta médica">
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      {exito && <Mensaje tipo="exito">Consulta guardada.</Mensaje>}
      <div className="rejilla-formulario">
        <Seleccion etiqueta="Tipo de consulta" value={f.tipo} onChange={(e) => set("tipo", e.target.value)}
          opciones={[{ valor: "primera", texto: "Primera consulta" }, { valor: "reconsulta", texto: "Reconsulta" }, { valor: "control", texto: "Control" }]} />
        {esMujer ? <Campo etiqueta="Semanas de embarazo (si está embarazada)" inputMode="numeric" value={f.semana} onChange={(e) => set("semana", e.target.value)} autoComplete="off" /> : <span />}
        <AreaTexto etiqueta="Motivo de la consulta" value={f.motivo} onChange={(e) => set("motivo", e.target.value)} maxLength={500} />
        <AreaTexto etiqueta="Historia de la enfermedad" value={f.historia} onChange={(e) => set("historia", e.target.value)} maxLength={2000} />
      </div>
      <fieldset className="grupo-campos"><legend>Diagnósticos</legend>
        {dx.map((d, i) => (
          <div className="renglon-dx" key={i}>
            <Campo etiqueta={`Diagnóstico ${i + 1}`} value={d.descripcion} onChange={(e) => setDxi(i, "descripcion", e.target.value)} maxLength={300} autoComplete="off" />
            <Campo etiqueta="CIE-10" value={d.cie} onChange={(e) => setDxi(i, "cie", e.target.value)} maxLength={7} autoComplete="off" placeholder="J06.9" />
            {dx.length > 1 ? <span /> : null}
            {dx.length > 1 && <Boton type="button" variante="secundario" icono={<Trash2 aria-hidden="true" size={20} />} onClick={() => setDx((a) => a.filter((_, j) => j !== i))}>Quitar</Boton>}
          </div>
        ))}
        {dx.length < 10 && <Boton type="button" variante="secundario" icono={<Plus aria-hidden="true" size={20} />} onClick={() => setDx((a) => [...a, { descripcion: "", cie: "" }])}>Agregar diagnóstico</Boton>}
      </fieldset>
      <div className="rejilla-formulario">
        <AreaTexto etiqueta="Conducta o tratamiento" value={f.conducta} onChange={(e) => set("conducta", e.target.value)} maxLength={2000} />
        <AreaTexto etiqueta="Problemas identificados" value={f.problemas} onChange={(e) => set("problemas", e.target.value)} maxLength={1000} />
        <Campo etiqueta="Referido a (si aplica)" value={f.referido} onChange={(e) => set("referido", e.target.value)} maxLength={200} autoComplete="off" />
      </div>
      <Boton type="submit" cargando={cargando}>{inicial ? "Guardar cambios" : "Guardar consulta"}</Boton>
    </form>
  );
}

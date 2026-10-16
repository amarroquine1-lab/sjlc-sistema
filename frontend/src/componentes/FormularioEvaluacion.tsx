import { type FormEvent, useState } from "react";
import { api } from "../api/cliente";
import type { EvaluacionVista } from "../api/tipos";
import { AreaTexto } from "./AreaTexto";
import { Boton } from "./Boton";
import { Campo } from "./Campo";
import { Mensaje } from "./Mensaje";

// Evaluación nutricional (provisional hasta confirmar el formato con la coordinadora).
export function FormularioEvaluacion({ idAtencion, inicial, alGuardar }: { idAtencion: number; inicial: EvaluacionVista | null; alGuardar: () => void }) {
  const [f, setF] = useState({ dx: inicial?.diagnostico_nutricional ?? "", cie: inicial?.codigo_cie10 ?? "", obs: inicial?.observaciones ?? "" });
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [cargando, setCargando] = useState(false);
  const set = (k: string, v: string) => { setF((a) => ({ ...a, [k]: v })); setExito(false); };

  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (!f.dx.trim()) { setError("Escriba el diagnóstico nutricional."); return; }
    setCargando(true);
    try {
      await api.put(`/api/atenciones/${idAtencion}/evaluacion-nutricional`, { diagnostico_nutricional: f.dx.trim(), codigo_cie10: f.cie.trim() || null, observaciones: f.obs.trim() || null });
      setExito(true); alGuardar();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar la evaluación."); }
    finally { setCargando(false); }
  };

  return (
    <form onSubmit={enviar} noValidate aria-label="Evaluación nutricional">
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      {exito && <Mensaje tipo="exito">Evaluación guardada.</Mensaje>}
      <Campo etiqueta="Diagnóstico nutricional" value={f.dx} onChange={(e) => set("dx", e.target.value)} maxLength={300} autoComplete="off" />
      <Campo etiqueta="CIE-10 (opcional)" value={f.cie} onChange={(e) => set("cie", e.target.value)} maxLength={7} autoComplete="off" placeholder="E44.0" />
      <AreaTexto etiqueta="Observaciones" value={f.obs} onChange={(e) => set("obs", e.target.value)} maxLength={1000} />
      <Boton type="submit" cargando={cargando}>{inicial ? "Guardar cambios" : "Guardar evaluación"}</Boton>
    </form>
  );
}

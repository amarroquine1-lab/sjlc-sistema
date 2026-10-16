import { type FormEvent, useState } from "react";
import { api, erroresPorCampo } from "../api/cliente";
import type { Signos } from "../api/tipos";
import { Boton } from "./Boton";
import { Campo } from "./Campo";
import { Mensaje } from "./Mensaje";

const numero = (t: string): number | null => {
  const v = t.trim().replace(",", ".");
  return v === "" ? null : Number(v);
};

// Mismos rangos que valida el servidor, con el mensaje por campo.
const RANGOS: Record<string, { etiqueta: string; min: number; max: number; unidad: string; entero?: boolean }> = {
  peso_lb: { etiqueta: "El peso", min: 0.7, max: 660, unidad: " libras" },
  talla_cm: { etiqueta: "La talla", min: 30, max: 250, unidad: " cm" },
  temperatura_c: { etiqueta: "La temperatura", min: 30, max: 45, unidad: " °C" },
  frecuencia_cardiaca: { etiqueta: "El pulso", min: 20, max: 250, unidad: " por minuto", entero: true },
  presion_sistolica: { etiqueta: "La presión alta", min: 50, max: 260, unidad: "", entero: true },
  presion_diastolica: { etiqueta: "La presión baja", min: 20, max: 160, unidad: "", entero: true },
  saturacion_oxigeno: { etiqueta: "La saturación", min: 50, max: 100, unidad: "", entero: true },
};

// Peso (libras), talla (cm; si escriben metros, como 1.48, se convierte), temperatura, presión, pulso y saturación.
export function FormularioSignos({ idAtencion, inicial, alGuardar }: { idAtencion: number; inicial: Signos | null; alGuardar: (s: Signos) => void }) {
  const [f, setF] = useState({
    peso: inicial?.peso_lb?.toString() ?? "", talla: inicial?.talla_cm?.toString() ?? "", temp: inicial?.temperatura_c?.toString() ?? "",
    alta: inicial?.presion_sistolica?.toString() ?? "", baja: inicial?.presion_diastolica?.toString() ?? "", fc: inicial?.frecuencia_cardiaca?.toString() ?? "",
    sat: inicial?.saturacion_oxigeno?.toString() ?? "", peligro: inicial?.hay_signos_peligro ?? false, detalle: inicial?.detalle_signos_peligro ?? "",
  });
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [cargando, setCargando] = useState(false);
  const set = (k: string, v: string | boolean) => setF((a) => ({ ...a, [k]: v }));

  const enviar = async (e: FormEvent) => {
    e.preventDefault(); setError(null); setErrores({});
    let talla = numero(f.talla);
    if (talla !== null && talla > 0 && talla < 3) talla = Math.round(talla * 1000) / 10; // metros a centímetros
    const valores: Record<string, number | null> = {
      peso_lb: numero(f.peso), talla_cm: talla, temperatura_c: numero(f.temp), presion_sistolica: numero(f.alta), presion_diastolica: numero(f.baja),
      frecuencia_cardiaca: numero(f.fc), saturacion_oxigeno: numero(f.sat),
    };
    const malos: Record<string, string> = {};
    for (const [k, r] of Object.entries(RANGOS)) {
      const v = valores[k];
      if (v === null) continue;
      if (!Number.isFinite(v)) malos[k] = `${r.etiqueta} debe ser un número (por ejemplo 36.5)`;
      else if (r.entero && !Number.isInteger(v)) malos[k] = `${r.etiqueta} debe ser un número entero`;
      else if (v < r.min || v > r.max) malos[k] = `${r.etiqueta} debe estar entre ${r.min} y ${r.max}${r.unidad}`;
    }
    if ((valores.presion_sistolica === null) !== (valores.presion_diastolica === null)) malos[valores.presion_sistolica === null ? "presion_sistolica" : "presion_diastolica"] = "La presión arterial lleva los dos valores: alta y baja";
    else if (valores.presion_sistolica !== null && valores.presion_diastolica !== null && !malos.presion_sistolica && !malos.presion_diastolica && valores.presion_diastolica >= valores.presion_sistolica) malos.presion_diastolica = "La presión baja debe ser menor que la alta";
    if (Object.keys(malos).length) { setErrores(malos); setError("Revise los campos marcados."); return; }
    setCargando(true);
    try {
      const r = await api.post<Signos>(`/api/atenciones/${idAtencion}/signos`, {
        ...valores, hay_signos_peligro: f.peligro, detalle_signos_peligro: f.peligro && f.detalle.trim() ? f.detalle.trim() : null,
      });
      alGuardar(r);
    } catch (err) {
      const porCampo = erroresPorCampo(err);
      if (Object.keys(porCampo).length) { setErrores(porCampo); setError("Revise los campos marcados."); }
      else setError(err instanceof Error ? err.message : "No se pudieron guardar los signos.");
    } finally { setCargando(false); }
  };

  return (
    <form onSubmit={enviar} noValidate aria-label="Signos vitales">
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      <div className="rejilla-formulario">
        <Campo etiqueta="Peso (libras)" inputMode="decimal" value={f.peso} onChange={(e) => set("peso", e.target.value)} error={errores.peso_lb} autoComplete="off" />
        <Campo etiqueta="Talla (cm)" inputMode="decimal" value={f.talla} onChange={(e) => set("talla", e.target.value)} error={errores.talla_cm} autoComplete="off" ayuda="Puede escribir 148 o 1.48." />
        <Campo etiqueta="Temperatura (°C)" inputMode="decimal" value={f.temp} onChange={(e) => set("temp", e.target.value)} error={errores.temperatura_c} autoComplete="off" />
        <Campo etiqueta="Pulso (por minuto)" inputMode="numeric" value={f.fc} onChange={(e) => set("fc", e.target.value)} error={errores.frecuencia_cardiaca} autoComplete="off" />
        <Campo etiqueta="Presión alta" inputMode="numeric" value={f.alta} onChange={(e) => set("alta", e.target.value)} error={errores.presion_sistolica} autoComplete="off" />
        <Campo etiqueta="Presión baja" inputMode="numeric" value={f.baja} onChange={(e) => set("baja", e.target.value)} error={errores.presion_diastolica} autoComplete="off" />
        <Campo etiqueta="Saturación de oxígeno (%)" inputMode="numeric" value={f.sat} onChange={(e) => set("sat", e.target.value)} error={errores.saturacion_oxigeno} autoComplete="off" />
      </div>
      <label className="casilla"><input type="checkbox" checked={f.peligro} onChange={(e) => set("peligro", e.target.checked)} />Hay señales de peligro</label>
      {f.peligro && <Campo etiqueta="¿Cuáles señales?" value={f.detalle} onChange={(e) => set("detalle", e.target.value)} error={errores.detalle_signos_peligro} autoComplete="off" />}
      <Boton type="submit" cargando={cargando}>{inicial ? "Guardar corrección" : "Guardar signos"}</Boton>
    </form>
  );
}

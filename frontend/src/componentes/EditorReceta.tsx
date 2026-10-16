import { Plus, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ErrorDeApi } from "../api/cliente";
import type { LineaRecetaVista } from "../api/tipos";
import { Boton } from "./Boton";
import { Campo } from "./Campo";
import { Mensaje } from "./Mensaje";

interface Linea { medicamento: string; presentacion: string; cantidad: string; indicaciones: string }
const nueva = (): Linea => ({ medicamento: "", presentacion: "", cantidad: "", indicaciones: "" });

// Receta en texto libre (no hay inventario ni catálogo): medicamento, presentación, cantidad e indicaciones por renglón.
// Los campos sugieren lo que ya se escribió antes, pero aceptan cualquier texto.
export function EditorReceta({ idAtencion, area, vigente, alGuardar }: { idAtencion: number; area: string; vigente: LineaRecetaVista[]; alGuardar: () => void }) {
  const propias = vigente.filter((l) => l.area === area);
  const [lineas, setLineas] = useState<Linea[]>(propias.map((l) => ({ medicamento: l.medicamento, presentacion: l.presentacion, cantidad: String(l.cantidad_recetada), indicaciones: l.indicaciones })));
  const [sugerencias, setSugerencias] = useState<{ medicamento: string[]; presentacion: string[] }>({ medicamento: [], presentacion: [] });
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState(false);
  const [cargando, setCargando] = useState(false);
  const temporizador = useRef<number | undefined>(undefined);

  useEffect(() => () => window.clearTimeout(temporizador.current), []);
  const sugerir = (campo: "medicamento" | "presentacion", texto: string) => {
    window.clearTimeout(temporizador.current);
    if (texto.trim().length < 3) { setSugerencias((s) => ({ ...s, [campo]: [] })); return; }
    temporizador.current = window.setTimeout(() => {
      api.get<{ datos: string[] }>(`/api/recetas/sugerencias?campo=${campo}&q=${encodeURIComponent(texto.trim())}`)
        .then((r) => setSugerencias((s) => ({ ...s, [campo]: r.datos }))).catch(() => undefined);
    }, 400);
  };
  const cambiar = (i: number, k: keyof Linea, v: string) => {
    setLineas((a) => a.map((l, j) => (j === i ? { ...l, [k]: v } : l))); setExito(false);
    setErrores((e) => { const { [`${i}.${k}`]: _x, ...resto } = e; return resto; });
    if (k === "medicamento" || k === "presentacion") sugerir(k, v);
  };

  const guardar = async () => {
    setError(null); setErrores({});
    const malos: Record<string, string> = {};
    lineas.forEach((l, i) => {
      if (!l.medicamento.trim()) malos[`${i}.medicamento`] = "Escriba el medicamento";
      if (!l.presentacion.trim()) malos[`${i}.presentacion`] = "Escriba la presentación (tableta, jarabe…)";
      if (!/^\d{1,3}$/.test(l.cantidad.trim()) || Number(l.cantidad) < 1) malos[`${i}.cantidad`] = "La cantidad debe estar entre 1 y 999";
      if (!l.indicaciones.trim()) malos[`${i}.indicaciones`] = "Escriba las indicaciones";
    });
    if (Object.keys(malos).length) { setErrores(malos); setError("Revise los renglones marcados."); return; }
    setCargando(true);
    try {
      await api.put(`/api/atenciones/${idAtencion}/receta`, { lineas: lineas.map((l) => ({ medicamento: l.medicamento.trim(), presentacion: l.presentacion.trim(), cantidad_recetada: Number(l.cantidad), indicaciones: l.indicaciones.trim() })) });
      setExito(true); alGuardar();
    } catch (e) {
      if (e instanceof ErrorDeApi && e.info.detalles?.length) {
        const m: Record<string, string> = {};
        for (const d of e.info.detalles) { const p = d.campo.split("."); if (p[0] === "lineas" && p.length >= 3) m[`${p[1]}.${p[2] === "cantidad_recetada" ? "cantidad" : p[2]}`] = d.mensaje; }
        setErrores(m);
      }
      setError(e instanceof Error ? e.message : "No se pudo guardar la receta.");
    } finally { setCargando(false); }
  };

  return (
    <section aria-label="Receta" className="bloque" id="seccion-receta">
      <h3>Receta</h3>
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      {exito && <Mensaje tipo="exito">{lineas.length ? "Receta guardada." : "La receta quedó sin medicamentos."}</Mensaje>}
      <datalist id="sug-medicamento">{sugerencias.medicamento.map((s) => <option key={s} value={s} />)}</datalist>
      <datalist id="sug-presentacion">{sugerencias.presentacion.map((s) => <option key={s} value={s} />)}</datalist>
      {lineas.map((l, i) => (
        <fieldset className="renglon-receta" key={i}>
          <legend>Medicamento {i + 1}</legend>
          <div className="rejilla-formulario">
            <Campo etiqueta="Medicamento" list="sug-medicamento" value={l.medicamento} maxLength={120} onChange={(e) => cambiar(i, "medicamento", e.target.value)} error={errores[`${i}.medicamento`]} autoComplete="off" ayuda="Nombre y concentración, por ejemplo: Amoxicilina 500 mg." />
            <Campo etiqueta="Presentación" list="sug-presentacion" value={l.presentacion} maxLength={60} onChange={(e) => cambiar(i, "presentacion", e.target.value)} error={errores[`${i}.presentacion`]} autoComplete="off" />
            <Campo etiqueta="Cantidad" inputMode="numeric" value={l.cantidad} onChange={(e) => cambiar(i, "cantidad", e.target.value)} error={errores[`${i}.cantidad`]} autoComplete="off" />
            <Campo etiqueta="Indicaciones" value={l.indicaciones} maxLength={300} onChange={(e) => cambiar(i, "indicaciones", e.target.value)} error={errores[`${i}.indicaciones`]} autoComplete="off" />
          </div>
          <Boton type="button" variante="secundario" icono={<Trash2 aria-hidden="true" size={20} />} onClick={() => { setLineas((a) => a.filter((_, j) => j !== i)); setExito(false); setErrores({}); }}>Quitar medicamento {i + 1}</Boton>
        </fieldset>
      ))}
      <div className="acciones">
        <Boton type="button" variante="secundario" icono={<Plus aria-hidden="true" size={20} />} onClick={() => { setLineas((a) => [...a, nueva()]); setExito(false); }}>Agregar medicamento</Boton>
        <Boton type="button" onClick={() => void guardar()} cargando={cargando}>{propias.length || lineas.length ? "Guardar receta" : "Dejar sin receta"}</Boton>
      </div>
    </section>
  );
}

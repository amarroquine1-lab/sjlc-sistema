import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api } from "../api/cliente";
import logoBn from "../recursos/marca/mspas-bn.png";
import type { AtencionHistorial, HistorialPaciente, Paciente } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Buscador } from "../componentes/Buscador";
import { Estado } from "../componentes/Estado";
import { Mensaje } from "../componentes/Mensaje";
import { TarjetaPaciente } from "../componentes/TarjetaPaciente";
import { nombreCompleto } from "../texto";

const med = (m: { medicamento: string; presentacion: string }) => `${m.medicamento} (${m.presentacion})`;

function Visita({ a }: { a: AtencionHistorial }) {
  const s = a.signos;
  return (
    <li className="visita">
      <div className="visita__fecha">{a.llegada.slice(0, 10)}<small>{a.llegada.slice(11)}</small></div>
      <div>
      <h3>{a.tipo} <Estado valor={a.estado} /> <span className="codigo">{a.numero_atencion}</span></h3>
      <p>Abrió la atención {a.abierta_por}{a.cierre ? ` · cierre ${a.cierre}` : ""}.</p>
      <h4>Recorrido</h4>
      <ul>{a.recorrido.map((r, i) => (
        <li key={i}><strong>{r.area}</strong>: llegó {r.entrada}{r.inicio ? `, atendió ${r.atendio ?? "—"} a las ${r.inicio} (esperó ${r.espera_minutos} min)` : ", no llegó a ser atendido"}{r.salida ? `, salió ${r.salida}` : ""}.{r.motivo_envio ? ` Motivo del envío: ${r.motivo_envio}.` : ""}</li>
      ))}</ul>
      {s && <><h4>Signos vitales</h4><p>{[s.peso_lb !== null && `peso ${s.peso_lb} lb`, s.talla_cm !== null && `talla ${s.talla_cm} cm`, s.temperatura_c !== null && `temperatura ${s.temperatura_c} °C`,
        s.presion_sistolica !== null && `presión ${s.presion_sistolica}/${s.presion_diastolica}`, s.frecuencia_cardiaca !== null && `pulso ${s.frecuencia_cardiaca}`, s.saturacion_oxigeno !== null && `saturación ${s.saturacion_oxigeno} %`].filter(Boolean).join(" · ")}
        {s.hay_signos_peligro ? ` · SEÑALES DE PELIGRO: ${s.detalle_signos_peligro ?? "sin detalle"}` : ""}</p></>}
      {a.consulta && <><h4>Consulta ({a.consulta.atendio})</h4>
        <p><strong>Motivo:</strong> {a.consulta.motivo_consulta}</p>
        {a.consulta.diagnosticos.length > 0 && <p><strong>Diagnóstico:</strong> {a.consulta.diagnosticos.map((d) => `${d.descripcion}${d.cie10 ? ` (${d.cie10})` : ""}`).join("; ")}</p>}
        {a.consulta.conducta_tratamiento && <p><strong>Conducta o tratamiento:</strong> {a.consulta.conducta_tratamiento}</p>}
        {a.consulta.problemas_identificados && <p><strong>Problemas identificados:</strong> {a.consulta.problemas_identificados}</p>}</>}
      {a.evaluacion_nutricional && <><h4>Evaluación nutricional</h4><p>{a.evaluacion_nutricional.diagnostico_nutricional}{a.evaluacion_nutricional.observaciones ? ` · ${a.evaluacion_nutricional.observaciones}` : ""}</p></>}
      {a.receta.length > 0 && <><h4>Receta y entrega</h4><ul>{a.receta.map((r, i) => (
        <li key={i}><strong>{med(r)}</strong> · recetado {r.cantidad_recetada} · {r.indicaciones}{r.cantidad_entregada !== null ? ` · entregado ${r.cantidad_entregada}${r.cantidad_no_entregada ? ` (falta ${r.cantidad_no_entregada}: ${r.observacion})` : ""}` : " · sin entrega registrada"}</li>
      ))}</ul></>}
      {a.vacunas.length > 0 && <><h4>Vacunas</h4><ul>{a.vacunas.map((v, i) => <li key={i}>{v.nombre_vacuna} · dosis {v.numero_dosis} · {v.fecha_aplicacion}{v.lote ? ` · lote ${v.lote}` : ""}</li>)}</ul></>}
      {a.proximos_controles.length > 0 && <><h4>Pendientes que dejó</h4><ul>{a.proximos_controles.map((c, i) => <li key={i}>{c.descripcion} · {c.area}{c.fecha_sugerida ? ` · ${c.fecha_sugerida}` : ""} · {c.estado}</li>)}</ul></>}
      </div>
    </li>
  );
}

// Historial completo de un paciente. Cada consulta queda en la bitácora.
export function Historial() {
  const { id } = useParams();
  const ir = useNavigate();
  const [candidatos, setCandidatos] = useState<Paciente[] | null>(null);
  const [h, setH] = useState<HistorialPaciente | null>(null);
  const [pagina, setPagina] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  const cargar = useCallback(async () => {
    if (!id) { setH(null); return; }
    if (!/^\d{1,10}$/.test(id)) { setH(null); setError("Paciente no válido."); return; }
    setCargando(true); setError(null);
    try { setH(await api.get<HistorialPaciente>(`/api/pacientes/${id}/historial?pagina=${pagina}&por_pagina=10`)); }
    catch (e) { setH(null); setError(e instanceof Error ? e.message : "No se pudo cargar el historial."); }
    finally { setCargando(false); }
  }, [id, pagina]);
  useEffect(() => { void cargar(); }, [cargar]);
  useEffect(() => { setPagina(1); }, [id]);

  const buscar = async (t: string) => {
    setError(null);
    try { setCandidatos((await api.get<{ datos: Paciente[] }>(`/api/pacientes/buscar?q=${encodeURIComponent(t)}`)).datos); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo buscar."); }
  };

  return (
    <div className="app" data-area="recepcion">
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <h1 className="no-imprimir">Historial del paciente</h1>
        <div className="no-imprimir"><Buscador alBuscar={(t) => void buscar(t)} /></div>
        {error && <div className="no-imprimir"><Mensaje tipo="error">{error}</Mensaje></div>}
        {candidatos && !id && (candidatos.length === 0 ? <p>No se encontró ningún paciente.</p> : (
          <ul className="lista sin-vinetas">{candidatos.map((c) => (
            <li key={c.id_paciente}><TarjetaPaciente paciente={{ ...c, edad: c.edad?.texto ?? null }} acciones={<Boton variante="secundario" onClick={() => ir(`/historial/${c.id_paciente}`)}>Ver historial</Boton>} /></li>
          ))}</ul>
        ))}
        {id && cargando && !h && <p>Cargando…</p>}
        {h && (
          <section aria-label="Historial" className="reporte">
            <p className="reporte__centro solo-impresion"><img className="reporte__logo" src={logoBn} width={920} height={832} alt="Ministerio de Salud Pública y Asistencia Social, Guatemala" /> Centro de Salud San José La Comunidad · zona 10, Mixco · historial impreso el {new Date().toLocaleString("es-GT", { timeZone: "America/Guatemala" })}</p>
            <h2>{nombreCompleto(h.paciente)} <span className="cifras">({h.paciente.codigo_paciente})</span></h2>
            {h.paciente.pendientes.length > 0 && <Mensaje tipo="aviso"><strong>Pendientes abiertos:</strong><ul>{h.paciente.pendientes.map((p) => <li key={p.id_proximo_control}>{p.descripcion} ({p.area}){p.fecha_sugerida ? ` · ${p.fecha_sugerida}` : ""}</li>)}</ul></Mensaje>}
            <p>{h.total} {h.total === 1 ? "atención" : "atenciones"} en total.</p>
            {h.atenciones.length === 0 ? <p>Este paciente todavía no tiene atenciones.</p> : <ol className="sin-vinetas">{h.atenciones.map((a) => <Visita key={a.id_atencion} a={a} />)}</ol>}
            <div className="acciones no-imprimir">
              <Boton variante="secundario" onClick={() => window.print()}>Imprimir esta página</Boton>
              <Boton variante="secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Más recientes</Boton>
              <Boton variante="secundario" disabled={pagina * h.por_pagina >= h.total} onClick={() => setPagina((p) => p + 1)}>Anteriores</Boton>
              <Link to="/historial">Buscar a otro paciente</Link>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}

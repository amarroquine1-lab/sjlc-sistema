import { AlertTriangle, FilePlus2, Printer, UserPlus, X } from "lucide-react";
import { Fragment } from "react";
import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { api, ErrorDeApi } from "../api/cliente";
import type { AtencionFila, Paciente, TipoAtencion } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { FamiliaEnEspera } from "../ilustraciones/Ilustraciones";
import { Vacio } from "../componentes/Vacio";
import { Buscador } from "../componentes/Buscador";
import { Campo } from "../componentes/Campo";
import { Dialogo } from "../componentes/Dialogo";
import { Estado } from "../componentes/Estado";
import { Mensaje } from "../componentes/Mensaje";
import { Tabla } from "../componentes/Tabla";
import { TarjetaPaciente } from "../componentes/TarjetaPaciente";
import { capitalizar, nombreBreve, nombreCompleto } from "../texto";

type Pestana = "buscar" | "abiertas" | "incompletos";
type Accion =
  | { tipo: "abrir"; paciente: Paciente; atencion: TipoAtencion }
  | { tipo: "retiro"; atencion: { id_atencion: number; numero_atencion: string; nombre: string } }
  | { tipo: "unir"; principal: Paciente; absorbido: Paciente; motivo: string };

// El registro con datos completos siempre es el que se conserva; el de emergencia (incompleto) queda unido a él.
const unir = (a: Paciente, b: Paciente, motivo: string): Accion =>
  a.datos_incompletos && !b.datos_incompletos ? { tipo: "unir", principal: b, absorbido: a, motivo } : { tipo: "unir", principal: a, absorbido: b, motivo };

const resumen = (p: Paciente) => ({ ...p, edad: p.edad?.texto ?? (p.edad_aproximada_anios !== null ? `unos ${p.edad_aproximada_anios} años` : null), estado: p.atencion_abierta?.estado, es_emergencia: p.atencion_abierta?.es_emergencia });

export function Recepcion() {
  const navegar = useNavigate();
  const ubicacion = useLocation();
  const origen = ubicacion.state as { seleccionar?: number; mensaje?: string; avisos?: string[]; ticket?: number } | null;
  const [pestana, setPestana] = useState<Pestana>("buscar");
  const [resultados, setResultados] = useState<Paciente[] | null>(null);
  const [abiertas, setAbiertas] = useState<AtencionFila[]>([]);
  const [incompletos, setIncompletos] = useState<Paciente[]>([]);
  const [sel, setSel] = useState<Paciente | null>(null);
  const [tipos, setTipos] = useState<TipoAtencion[]>([]);
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error" | "aviso"; texto: string; ticket?: number } | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [unirAbierto, setUnirAbierto] = useState(false);
  const [candidatos, setCandidatos] = useState<Paciente[]>([]);
  const [motivo, setMotivo] = useState("");
  const [avisosCui, setAvisosCui] = useState<string[]>([]);

  const cargarListas = useCallback(async () => {
    const [a, i] = await Promise.all([api.get<{ datos: AtencionFila[] }>("/api/atenciones/abiertas"), api.get<{ datos: Paciente[] }>("/api/pacientes/incompletos")]);
    setAbiertas(a.datos); setIncompletos(i.datos);
  }, []);
  const recargarSel = useCallback(async (id: number) => { const p = await api.get<Paciente>(`/api/pacientes/${id}`); setSel(p); return p; }, []);

  useEffect(() => {
    void api.get<{ datos: TipoAtencion[] }>("/api/catalogos/tipos-atencion").then((r) => setTipos(r.datos));
    void cargarListas();
  }, [cargarListas]);
  useEffect(() => {
    if (origen?.seleccionar) void recargarSel(origen.seleccionar);
    if (origen?.mensaje) setMensaje({ tipo: "exito", texto: origen.mensaje, ticket: origen.ticket });
    if (origen?.avisos?.length) setAvisosCui(origen.avisos);
    if (origen) navegar(ubicacion.pathname, { replace: true, state: null });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const buscar = async (texto: string) => {
    setMensaje(null); setCargando(true); setPestana("buscar");
    try { const r = await api.get<{ datos: Paciente[] }>(`/api/pacientes/buscar?q=${encodeURIComponent(texto)}`); setResultados(r.datos); if (r.datos.length === 1) setSel(r.datos[0]); }
    catch (e) { setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo buscar." }); }
    finally { setCargando(false); }
  };

  const buscarOtro = async (texto: string) => {
    try { const r = await api.get<{ datos: Paciente[] }>(`/api/pacientes/buscar?q=${encodeURIComponent(texto)}`); setCandidatos(r.datos.filter((p) => p.id_paciente !== sel?.id_paciente)); }
    catch (e) { setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo buscar." }); }
  };

  const ejecutar = async () => {
    if (!accion) return;
    setCargando(true);
    try {
      if (accion.tipo === "abrir") {
        const a = await api.post<AtencionFila>("/api/atenciones", { id_paciente: accion.paciente.id_paciente, id_tipo_atencion: accion.atencion.id_tipo_atencion });
        setMensaje({ tipo: "exito", texto: `Atención ${a.numero_atencion} abierta para ${nombreBreve(accion.paciente)}: pasó a ${a.area_actual ?? "la cola"}.`, ticket: a.id_atencion });
        await recargarSel(accion.paciente.id_paciente);
      } else if (accion.tipo === "retiro") {
        await api.post(`/api/atenciones/${accion.atencion.id_atencion}/se-retiro`);
        setMensaje({ tipo: "exito", texto: `Se anotó que ${accion.atencion.nombre} (${accion.atencion.numero_atencion}) se retiró.` });
        if (sel) await recargarSel(sel.id_paciente);
      } else {
        const p = await api.post<Paciente>(`/api/pacientes/${accion.principal.id_paciente}/unir`, { id_paciente_unido: accion.absorbido.id_paciente, motivo: accion.motivo });
        setMensaje({ tipo: "exito", texto: `Se unió ${accion.absorbido.codigo_paciente} en ${accion.principal.codigo_paciente}.` });
        setSel(p); setUnirAbierto(false); setCandidatos([]); setMotivo("");
      }
      await cargarListas();
    } catch (e) {
      setMensaje({ tipo: "error", texto: e instanceof ErrorDeApi ? e.info.mensaje : "No se pudo completar la acción." });
    } finally { setCargando(false); setAccion(null); }
  };

  const ab = sel?.atencion_abierta ?? null;
  return (
    <div className="app" data-area="recepcion">
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="encabezado-pantalla">
          <span className="encabezado-pantalla__il"><FamiliaEnEspera tamano={84} /></span>
          <h1>Recepción</h1>
          <Boton icono={<UserPlus aria-hidden="true" size={22} />} onClick={() => navegar("/recepcion/nuevo")}>Nuevo paciente</Boton>
          <Boton variante="peligro" icono={<AlertTriangle aria-hidden="true" size={22} />} onClick={() => navegar("/recepcion/emergencia")}>Emergencia</Boton>
        </div>
        {mensaje && (
          <Mensaje tipo={mensaje.tipo}>
            {mensaje.texto}{" "}
            {mensaje.ticket && <Boton variante="secundario" icono={<Printer aria-hidden="true" size={20} />} onClick={() => navegar(`/recepcion/ticket/${mensaje.ticket}`)}>Imprimir ticket</Boton>}
          </Mensaje>
        )}
        {avisosCui.map((a) => <Mensaje key={a} tipo="aviso">{a}</Mensaje>)}
        <div className="dos-columnas">
          <section className="cola" aria-label="Buscar y listas">
            <Buscador alBuscar={(t) => void buscar(t)} cargando={cargando && !accion} />
            <div className="pestanas" role="tablist" aria-label="Listas de recepción">
              {([["buscar", "Resultados"], ["abiertas", `Atenciones abiertas (${abiertas.length})`], ["incompletos", `Datos incompletos (${incompletos.length})`]] as const).map(([k, t]) => (
                <button key={k} role="tab" type="button" className="pestana" aria-selected={pestana === k} onClick={() => { setPestana(k); void cargarListas(); }}>{t}</button>
              ))}
            </div>
            {pestana === "buscar" && (
              resultados === null ? <p>Escriba un código, DPI, nombre o fecha de nacimiento para buscar.</p>
              : resultados.length === 0 ? <Mensaje tipo="info">No se encontró a nadie. Puede registrarlo con "Nuevo paciente".</Mensaje>
              : <div className="lista">{resultados.map((p) => (
                  <button key={p.id_paciente} type="button" className="lista__elemento" aria-pressed={sel?.id_paciente === p.id_paciente} onClick={() => setSel(p)}>
                    <TarjetaPaciente paciente={resumen(p)} />
                  </button>))}</div>
            )}
            {pestana === "abiertas" && (
              <Tabla filas={abiertas} clave={(a) => a.id_atencion} vacio="No hay atenciones abiertas."
                columnas={[
                  { titulo: "Atención", celda: (a) => <span className="codigo">{a.numero_atencion}</span> },
                  { titulo: "Paciente", celda: (a) => nombreBreve(a) },
                  { titulo: "Estado", celda: (a) => <>{a.es_emergencia && <Estado valor="emergencia" />} <Estado valor={a.estado} /></> },
                  { titulo: "Área", celda: (a) => a.area_actual ?? "—" },
                  { titulo: "", celda: (a) => <Boton variante="secundario" onClick={() => setAccion({ tipo: "retiro", atencion: { id_atencion: a.id_atencion, numero_atencion: a.numero_atencion, nombre: nombreBreve(a) } })}>Se retiró</Boton> },
                ]} />
            )}
            {pestana === "incompletos" && (
              incompletos.length === 0 ? <p>No hay registros con datos incompletos.</p>
              : <div className="lista">{incompletos.map((p) => (
                  <button key={p.id_paciente} type="button" className="lista__elemento" aria-pressed={sel?.id_paciente === p.id_paciente} onClick={() => setSel(p)}>
                    <TarjetaPaciente paciente={resumen(p)} />
                  </button>))}</div>
            )}
          </section>

          <section className={`panel${sel ? "" : " panel--vacio"}`} aria-label="Paciente seleccionado">
            {!sel ? <Vacio titulo="Ningún paciente seleccionado.">Busque a alguien o elíjalo de la lista para ver sus datos y abrir una atención.</Vacio> : (
              <>
                <header className="cabecera-paciente cabecera-paciente--con-cierre">
                  <div>
                    <h2>{nombreCompleto(sel)}</h2>
                    <p className="cabecera-paciente__meta cifras">
                      <span className="codigo">{sel.codigo_paciente}</span>{resumen(sel).edad && <span>{resumen(sel).edad}</span>}<span>{sel.sexo === "F" ? "Mujer" : "Hombre"}</span>
                    </p>
                    <div className="etiquetas">
                      {ab && <Estado valor={ab.estado} />}{sel.datos_incompletos && <span className="estado estado--en_espera">Datos incompletos</span>}
                    </div>
                  </div>
                  <Boton variante="secundario" className="boton--pequeno" icono={<X aria-hidden="true" size={20} />} onClick={() => { setSel(null); setUnirAbierto(false); }}>Cerrar</Boton>
                </header>
                <div className="panel__cuerpo">
                  <dl className="datos">
                    <dt>DPI/CUI</dt><dd>{sel.cui ?? "No tiene"}</dd>
                    <dt>Nacimiento</dt><dd>{sel.fecha_nacimiento ?? "No se conoce"}</dd>
                    <dt>Teléfono</dt><dd>{sel.telefono ?? "—"}</dd>
                    <dt>Vive en</dt><dd>{[sel.direccion, sel.zona_residencia ? `zona ${sel.zona_residencia}` : null, sel.municipio_residencia].filter(Boolean).join(", ") || "—"}</dd>
                    {sel.numero_registro_libro && <><dt>Libro</dt><dd>{sel.numero_registro_libro}</dd></>}
                    {sel.encargados.map((e) => <Fragment key={e.id_encargado}><dt>{e.parentesco}</dt><dd>{e.nombres} {e.apellidos}{e.dpi ? ` · DPI ${e.dpi}` : ""}</dd></Fragment>)}
                  </dl>
                  {sel.pendientes.length > 0 && (
                    <Mensaje tipo="aviso"><strong>Pendientes de este paciente:</strong><ul>{sel.pendientes.map((p) => <li key={p.id_proximo_control}>{p.descripcion} ({p.area}{p.fecha_sugerida ? `, ${p.fecha_sugerida}` : ""})</li>)}</ul></Mensaje>
                  )}
                  {ab ? (
                    <>
                      <Mensaje tipo="info">Tiene la atención <strong className="codigo">{ab.numero_atencion}</strong> abierta ({capitalizar(ab.tipo)}) en {capitalizar(ab.area_actual ?? "espera")}.</Mensaje>
                      <div className="recepcion__acciones">
                        <Boton icono={<Printer aria-hidden="true" size={20} />} onClick={() => navegar(`/recepcion/ticket/${ab.id_atencion}`)}>Imprimir ticket</Boton>
                        <Boton variante="secundario" onClick={() => setAccion({ tipo: "retiro", atencion: { id_atencion: ab.id_atencion, numero_atencion: ab.numero_atencion, nombre: nombreBreve(sel) } })}>Se retiró</Boton>
                      </div>
                    </>
                  ) : (
                    <>
                      <h3>Abrir una atención</h3>
                      <div className="recepcion__acciones">{tipos.map((t) => (
                        <Boton key={t.id_tipo_atencion} variante={t.es_emergencia ? "peligro" : "primario"} icono={<FilePlus2 aria-hidden="true" size={20} />} onClick={() => setAccion({ tipo: "abrir", paciente: sel, atencion: t })}>{capitalizar(t.nombre_tipo_atencion)}</Boton>
                      ))}</div>
                    </>
                  )}
                  <div className="recepcion__secundarias">
                    <Boton variante="secundario" onClick={() => navegar(`/historial/${sel.id_paciente}`)}>Ver historial</Boton>
                    <Boton variante="secundario" onClick={() => navegar(`/recepcion/paciente/${sel.id_paciente}/editar`)}>{sel.datos_incompletos ? "Completar datos del paciente" : "Editar datos del paciente"}</Boton>
                    <Boton variante="secundario" onClick={() => setUnirAbierto(!unirAbierto)} aria-expanded={unirAbierto}>Unir con otro registro</Boton>
                  </div>
                  {unirAbierto && (
                    <div className="bloque-unir" role="group" aria-label="Unir registros">
                      <div className="panel__cerrar"><Boton variante="secundario" className="boton--pequeno" icono={<X aria-hidden="true" size={20} />} onClick={() => { setUnirAbierto(false); setCandidatos([]); setMotivo(""); }}>Cancelar</Boton></div>
                      <h3>Unir con otro registro</h3>
                      <p>Busque el registro repetido. Se conserva el registro con los datos completos y el otro queda unido a él; el historial se consolida.</p>
                      <Buscador alBuscar={(t) => void buscarOtro(t)} />
                      <div className="lista">{candidatos.map((c) => (
                        <TarjetaPaciente key={c.id_paciente} paciente={resumen(c)} acciones={
                          <div className="acciones"><Boton variante="secundario" onClick={() => motivo.trim().length >= 5 ? setAccion(unir(sel, c, motivo.trim())) : setMensaje({ tipo: "error", texto: "Escriba el motivo de la unión (mínimo 5 letras)." })}>Unir este registro</Boton></div>} />
                      ))}</div>
                      <Campo etiqueta="Motivo de la unión" value={motivo} onChange={(e) => setMotivo(e.target.value)} ayuda="Por ejemplo: era la misma persona atendida de emergencia." />
                    </div>
                  )}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      {accion?.tipo === "abrir" && (
        <Dialogo titulo="Abrir atención" textoConfirmar={`Abrir ${accion.atencion.nombre_tipo_atencion}`} cargando={cargando} alConfirmar={() => void ejecutar()} alCancelar={() => setAccion(null)}>
          <p>¿Abrir una atención de <strong>{capitalizar(accion.atencion.nombre_tipo_atencion)}</strong> para {nombreBreve(accion.paciente)} ({accion.paciente.codigo_paciente})?</p>
          {accion.paciente.pendientes.length > 0 && <p>Recuerde sus pendientes: {accion.paciente.pendientes.map((p) => p.descripcion).join("; ")}.</p>}
        </Dialogo>
      )}
      {accion?.tipo === "retiro" && (
        <Dialogo titulo="Marcar que se retiró" textoConfirmar="Sí, se retiró" peligro cargando={cargando} alConfirmar={() => void ejecutar()} alCancelar={() => setAccion(null)}>
          <p>¿Anotar que {accion.atencion.nombre} ({accion.atencion.numero_atencion}) se retiró sin terminar su atención? Ya no aparecerá en las colas.</p>
        </Dialogo>
      )}
      {accion?.tipo === "unir" && (
        <Dialogo titulo="Unir registros" textoConfirmar="Unir registros" peligro cargando={cargando} alConfirmar={() => void ejecutar()} alCancelar={() => setAccion(null)}>
          <p>¿Unir <strong>{nombreBreve(accion.absorbido)} ({accion.absorbido.codigo_paciente})</strong> en <strong>{nombreBreve(accion.principal)} ({accion.principal.codigo_paciente})</strong>?</p>
          <p>Motivo: {accion.motivo}. Esta unión queda anotada y no se deshace.</p>
        </Dialogo>
      )}
    </div>
  );
}

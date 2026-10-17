import { PhoneCall } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, ErrorDeApi } from "../api/cliente";
import type { Cola, FilaCola, OpcionEnvio, PanelAtencion } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { useSesion } from "../sesion/ContextoSesion";
import { ILUSTRACION_DE_AREA } from "../ilustraciones/Ilustraciones";
import { Dialogo } from "../componentes/Dialogo";
import { Mensaje } from "../componentes/Mensaje";
import { ResumenSignos } from "../componentes/ResumenSignos";
import { Estado } from "../componentes/Estado";
import { Vacio } from "../componentes/Vacio";
import { capitalizar, nombreBreve, nombreCompleto } from "../texto";

interface Props {
  clave: "signos" | "doctor" | "nutricion" | "vacunacion" | "farmacia";
  titulo: string;
  /** Contenido propio del área para el paciente en atención (formulario de signos, consulta, etc.). */
  panelDelArea?: (panel: PanelAtencion, recargar: () => Promise<void>, terminar: (texto: string) => Promise<void>) => ReactNode;
  /** Muestra los signos vitales de hoy en solo lectura. */
  mostrarSignos?: boolean;
}

const INTERVALO_MS = 5000;

// Pantalla de un área: la cola a la izquierda y el paciente en atención a la derecha. "Llamar siguiente" y "Enviar a…".
export function PantallaArea({ clave, titulo, panelDelArea, mostrarSignos = true }: Props) {
  const [cola, setCola] = useState<Cola | null>(null);
  const [panel, setPanel] = useState<PanelAtencion | null>(null);
  const navegar = useNavigate();
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error" | "aviso"; texto: string } | null>(null);
  const [envio, setEnvio] = useState<OpcionEnvio | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
  const [devolviendo, setDevolviendo] = useState(false);
  // Paciente que atiende otra persona: se abre su detalle (solo lectura) y, para Administración, las acciones con confirmación.
  const [ajena, setAjena] = useState<{ fila: FilaCola; paso: "ver" | "tomar" | "devolver" } | null>(null);
  const { yo } = useSesion();
  const esAdmin = yo?.rol === "administrador";
  const idActual = useRef<number | null>(null);

  const cargarPanel = useCallback(async (id: number) => {
    try { setPanel(await api.get<PanelAtencion>(`/api/atenciones/${id}/panel`)); } catch { setPanel(null); }
  }, []);

  const cargarCola = useCallback(async (automatica: boolean) => {
    try {
      const c = await api.get<Cola>(`/api/cola/${clave}`, { automatica });
      setCola(c);
      const id = c.mi_atencion?.id_atencion ?? null;
      if (id !== idActual.current) { idActual.current = id; if (id) await cargarPanel(id); else setPanel(null); }
    } catch (e) { if (!automatica) setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo cargar la cola." }); }
  }, [clave, cargarPanel]);

  // La cola se actualiza sola cada 5 segundos (sondeo): simple, atraviesa el proxy sin ajustes y alcanza para 7 puestos.
  useEffect(() => {
    void cargarCola(false);
    const t = window.setInterval(() => { if (document.visibilityState === "visible") void cargarCola(true); }, INTERVALO_MS);
    return () => window.clearInterval(t);
  }, [cargarCola]);

  // Sin número: "Llamar siguiente" (el que sigue según el orden). Con número: "Atender" a ese paciente de la lista.
  const llamar = async (idAtencion?: number) => {
    setMensaje(null); setCargando(true);
    try {
      const p = await api.post<PanelAtencion>(idAtencion ? `/api/cola/${clave}/atender/${idAtencion}` : `/api/cola/${clave}/llamar-siguiente`);
      idActual.current = p.atencion.id_atencion; setPanel(p);
      await cargarCola(false);
      setMensaje({ tipo: "exito", texto: `Llamó a ${nombreBreve(p.paciente)} (${p.atencion.numero_atencion}).` });
    } catch (e) { setMensaje({ tipo: e instanceof ErrorDeApi && e.info.codigo === "COLA_VACIA" ? "aviso" : "error", texto: e instanceof Error ? e.message : "No se pudo llamar al siguiente." }); await cargarCola(false); }
    finally { setCargando(false); }
  };

  const confirmarEnvio = async () => {
    if (!panel || !envio) return;
    setCargando(true);
    try {
      await api.post(`/api/atenciones/${panel.atencion.id_atencion}/enviar`, { destino: envio.destino, motivo: envio.destino === "finalizar" ? null : motivo.trim() || null });
      setMensaje({ tipo: "exito", texto: envio.destino === "finalizar" ? `Atención de ${nombreBreve(panel.paciente)} (${panel.atencion.numero_atencion}) finalizada.` : `${nombreBreve(panel.paciente)} (${panel.atencion.numero_atencion}) pasó a ${envio.etiqueta}.` });
      idActual.current = null; setPanel(null);
      await cargarCola(false);
    } catch (e) { setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo enviar al paciente." }); }
    finally { setCargando(false); setEnvio(null); setMotivo(""); }
  };

  const confirmarDevolucion = async () => {
    if (!panel) return;
    setCargando(true);
    try {
      await api.post(`/api/atenciones/${panel.atencion.id_atencion}/devolver`);
      setMensaje({ tipo: "exito", texto: `${nombreBreve(panel.paciente)} (${panel.atencion.numero_atencion}) volvió a la cola de ${titulo}.` });
      idActual.current = null; setPanel(null);
    } catch (e) { setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo devolver al paciente a la cola." }); }
    finally { setCargando(false); setDevolviendo(false); await cargarCola(false); }
  };

  const confirmarAjena = async () => {
    if (!ajena || ajena.paso === "ver") return;
    const { fila: f, paso } = ajena;
    setCargando(true);
    try {
      if (paso === "tomar") {
        await api.post(`/api/atenciones/${f.id_atencion}/tomar`);
        setMensaje({ tipo: "exito", texto: `Tomó la atención de ${nombreBreve(f)} (${f.numero_atencion}); la llevaba ${f.atiende ?? "otra persona"}.` });
      } else {
        await api.post(`/api/atenciones/${f.id_atencion}/devolver`);
        setMensaje({ tipo: "exito", texto: `${nombreBreve(f)} (${f.numero_atencion}) volvió a la cola de ${titulo}.` });
      }
    } catch (e) { setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo completar la acción." }); }
    finally { setCargando(false); setAjena(null); await cargarCola(false); }
  };

  const recargar = async () => { if (panel) await cargarPanel(panel.atencion.id_atencion); };
  // Cierre hecho dentro del panel del área (farmacia: entregar y finalizar): se despide al paciente y se refresca la cola.
  const terminar = async (texto: string) => {
    setMensaje({ tipo: "exito", texto }); idActual.current = null; setPanel(null); await cargarCola(false);
  };
  // Farmacia siempre se ofrece al doctor; sin receta guardada se pide primero agregarla.
  const elegirEnvio = (o: OpcionEnvio) => {
    if (o.requiere_receta) {
      setMensaje({ tipo: "aviso", texto: "Primero agregue y guarde la receta. Farmacia solo recibe pacientes con receta." });
      document.getElementById("seccion-receta")?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setMotivo(""); setEnvio(o);
  };
  const edadDe = (f: FilaCola) => f.edad;
  const fila = (f: FilaCola, atendiendo: boolean) => {
    const nombre = [f.nombres, f.apellidos].filter(Boolean).join(" ") || "Sin identificar";
    return (
      <li key={f.id_recorrido_atencion} className={`fila-cola${f.es_emergencia ? " fila-cola--emergencia" : ""}${atendiendo ? " fila-cola--ajena" : ""}`}
        onClick={atendiendo ? () => setAjena({ fila: f, paso: "ver" }) : undefined}>
        <div className="fila-cola__nombre">{nombre}</div>
        <div className="fila-cola__meta cifras">
          <span className="codigo">{f.codigo_paciente}</span><span className="codigo">{f.numero_atencion}</span>
          <span>{[edadDe(f), f.sexo === "F" ? "Mujer" : "Hombre"].filter(Boolean).join(" · ")}</span>
        </div>
        {!atendiendo && (
          <div className="fila-cola__accion">
            <Boton variante="acento" className="boton--pequeno" aria-label={`Atender a ${nombreBreve(f)} (${f.numero_atencion})`} disabled={cargando || ocupado} onClick={() => void llamar(f.id_atencion)}>Atender</Boton>
          </div>
        )}
        <div className="etiquetas">
          {f.es_emergencia && <Estado valor="emergencia" />} <Estado valor={f.estado} />
          {f.datos_incompletos && <span className="estado estado--en_espera">Datos incompletos</span>}
        </div>
        <div className="fila-cola__meta cifras">
          {atendiendo ? <span>Lo atiende {f.atiende ?? "—"}</span> : <span>Llegó a las {f.entrada_hora} · espera {f.espera_minutos} min</span>}
          {f.pendientes > 0 && <span>{f.pendientes} pendiente(s)</span>}
        </div>
        {f.motivo_envio && <p className="fila-cola__motivo">Motivo: {f.motivo_envio}</p>}
        {atendiendo && <div className="fila-cola__accion"><Boton variante="secundario" className="boton--pequeno" aria-label={`Ver detalle de ${nombreBreve(f)} (${f.numero_atencion})`}>Ver detalle</Boton></div>}
      </li>
    );
  };
  const otraArea = cola?.mi_atencion_otra_area ?? null;
  const ocupado = Boolean(cola?.mi_atencion) || Boolean(otraArea);
  const otros = cola?.en_atencion.filter((f) => f.id_atencion !== cola.mi_atencion?.id_atencion) ?? [];

  const Ilustracion = ILUSTRACION_DE_AREA[clave];
  return (
    <div className="app" data-area={clave}>
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="encabezado-pantalla">
          <span className="encabezado-pantalla__il">{Ilustracion && <Ilustracion tamano={84} />}</span>
          <h1>{titulo}</h1>
          <Boton variante="acento" icono={<PhoneCall aria-hidden="true" size={22} />} onClick={() => void llamar()} cargando={cargando && !envio} disabled={ocupado}>Llamar siguiente</Boton>
        </div>
        {otraArea && (
          <Mensaje tipo="aviso">
            Tiene a {otraArea.paciente} ({otraArea.numero_atencion}) en atención en {otraArea.area}. Termine con él antes de llamar a otro.
            {otraArea.clave && <> <Boton variante="secundario" className="boton--pequeno" onClick={() => navegar(`/${otraArea.clave}`)}>Ir a {otraArea.area}</Boton></>}
          </Mensaje>
        )}
        {mensaje && <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>}
        <div className="dos-columnas">
          <section className="cola" aria-label="Cola de espera">
            <h2><span>En espera</span><span className="cifras">{cola?.en_espera.length ?? 0}</span></h2>
            {cola && cola.en_espera.length === 0
              ? <Vacio titulo="No hay pacientes esperando.">Cuando recepción o otra área envíe a alguien, aparecerá aquí.</Vacio>
              : <ul className="cola__lista">{cola?.en_espera.map((f) => fila(f, false))}</ul>}
            {otros.length > 0 && (
              <><h2><span>En atención ahora</span><span className="cifras">{otros.length}</span></h2><ul className="cola__lista">{otros.map((f) => fila(f, true))}</ul></>
            )}
          </section>
          <section className={`panel${panel ? "" : " panel--vacio"}`} aria-label="Paciente en atención">
            {!panel ? (
              <Vacio titulo="No tiene a nadie en atención.">Use “Llamar siguiente” para tomar al que sigue, o “Atender” en un paciente de la lista.</Vacio>
            ) : (
              <>
                <header className="cabecera-paciente">
                  <h2>{nombreCompleto(panel.paciente)}</h2>
                  <p className="cabecera-paciente__meta cifras">
                    <span className="codigo">{panel.paciente.codigo_paciente}</span><span className="codigo">{panel.atencion.numero_atencion}</span>
                    {(panel.paciente.edad?.texto ?? (panel.paciente.edad_aproximada_anios !== null ? `unos ${panel.paciente.edad_aproximada_anios} años` : null)) && <span>{panel.paciente.edad?.texto ?? `unos ${panel.paciente.edad_aproximada_anios} años`}</span>}
                    <span>{panel.paciente.sexo === "F" ? "Mujer" : "Hombre"}</span><span>{capitalizar(panel.atencion.tipo)}</span>
                  </p>
                  <div className="etiquetas">
                    {panel.atencion.es_emergencia && <Estado valor="emergencia" />} <Estado valor={panel.atencion.estado} />
                    {panel.paciente.datos_incompletos && <span className="estado estado--en_espera">Datos incompletos</span>}
                  </div>
                  <div className="cabecera-paciente__devolver">
                    <Boton variante="secundario" className="boton--pequeno" onClick={() => setDevolviendo(true)}>Devolver a la cola</Boton>
                  </div>
                </header>
                <div className="panel__cuerpo">
                  {panel.atencion.motivo_envio && <Mensaje tipo="aviso"><strong>Motivo del envío:</strong> {panel.atencion.motivo_envio}</Mensaje>}
                  {panel.paciente.pendientes.length > 0 && <Mensaje tipo="aviso"><strong>Pendientes de este paciente:</strong><ul>{panel.paciente.pendientes.map((p) => <li key={p.id_proximo_control}>{p.descripcion} ({p.area})</li>)}</ul></Mensaje>}
                  {mostrarSignos && <><h3>Signos vitales de hoy</h3><ResumenSignos signos={panel.signos} /></>}
                  {panelDelArea?.(panel, recargar, terminar)}
                </div>
                <div className="barra-envio" role="group" aria-label="Enviar a">
                  <h3>Enviar a…</h3>
                  {panel.opciones_envio.map((o) => (
                    <Boton key={o.destino} data-destino={o.destino} variante={o.sugerido ? "primario" : "secundario"} onClick={() => elegirEnvio(o)}>
                      {o.destino === "finalizar" ? "Finalizar" : `Enviar a ${capitalizar(o.etiqueta)}`}{o.sugerido ? " (sugerido)" : ""}
                    </Boton>
                  ))}
                </div>
              </>
            )}
          </section>
        </div>
      </main>
      {ajena && (() => {
        const f = ajena.fila; const quien = f.atiende ?? "otra persona";
        if (ajena.paso === "tomar") return (
          <Dialogo titulo="Tomar la atención" textoConfirmar="Tomar atención" cargando={cargando} alConfirmar={() => void confirmarAjena()} alCancelar={() => setAjena({ fila: f, paso: "ver" })}>
            <p>¿Tomar la atención de {nombreBreve(f)} ({f.numero_atencion}) que lleva {quien}?</p>
            <p>Pasa a su nombre en {titulo} y {quien} deja de verlo en su pantalla. Queda en la bitácora.</p>
          </Dialogo>
        );
        if (ajena.paso === "devolver") return (
          <Dialogo titulo="Devolver a la cola" textoConfirmar="Devolver a la cola" cargando={cargando} alConfirmar={() => void confirmarAjena()} alCancelar={() => setAjena({ fila: f, paso: "ver" })}>
            <p>¿Devolver a {nombreBreve(f)} ({f.numero_atencion}) a la cola de {titulo}?</p>
            <p>Vuelve a su lugar en la cola y lo que {quien} haya escrito sin guardar se descarta. Si ya se guardaron datos de este paciente aquí, no se podrá devolver. Queda en la bitácora.</p>
          </Dialogo>
        );
        return (
          <Dialogo titulo="Paciente en atención" textoCancelar="Cerrar" alCancelar={() => setAjena(null)}
            acciones={esAdmin && (<>
              <Boton variante="secundario" disabled={Boolean(cola?.mi_atencion)} onClick={() => setAjena({ fila: f, paso: "devolver" })}>Devolver a la cola</Boton>
              <Boton variante="acento" disabled={Boolean(cola?.mi_atencion)} onClick={() => setAjena({ fila: f, paso: "tomar" })}>Tomar atención</Boton>
            </>)}>
            <dl className="datos-ajena">
              <dt>Paciente</dt><dd>{nombreCompleto(f)}</dd>
              <dt>Código y atención</dt><dd className="cifras">{f.codigo_paciente} · {f.numero_atencion}</dd>
              <dt>Edad y sexo</dt><dd>{[f.edad, f.sexo === "F" ? "Mujer" : "Hombre"].filter(Boolean).join(" · ")}</dd>
              <dt>Tipo</dt><dd>{capitalizar(f.tipo)}</dd>
              <dt>Área</dt><dd>{titulo}</dd>
              <dt>Lo atiende</dt><dd>{quien}</dd>
              <dt>Desde las</dt><dd className="cifras">{f.inicio_hora ?? "—"}</dd>
            </dl>
            {esAdmin && cola?.mi_atencion && <p>Para tomarlo o devolverlo, primero termine con su paciente en esta área.</p>}
          </Dialogo>
        );
      })()}
      {devolviendo && panel && (
        <Dialogo titulo="Devolver a la cola" textoConfirmar="Devolver a la cola" cargando={cargando} alConfirmar={() => void confirmarDevolucion()} alCancelar={() => setDevolviendo(false)}>
          <p>¿Devolver a {nombreBreve(panel.paciente)} ({panel.atencion.numero_atencion}) a la cola de {titulo}?</p>
          <p>Vuelve a su lugar en la cola y otra persona (o usted) podrá llamarlo. Si capturó datos sin guardar, se descartarán. Si ya guardó datos de este paciente aquí, no se podrá devolver.</p>
        </Dialogo>
      )}
      {envio && panel && (
        <Dialogo destino={envio.destino} titulo={envio.destino === "finalizar" ? "Finalizar la atención" : "Enviar al paciente"} textoConfirmar={envio.destino === "finalizar" ? "Finalizar" : `Enviar a ${envio.etiqueta}`} cargando={cargando} alConfirmar={() => void confirmarEnvio()} alCancelar={() => { setEnvio(null); setMotivo(""); }}>
          <p>{envio.destino === "finalizar"
            ? `¿Finalizar la atención de ${nombreBreve(panel.paciente)} (${panel.atencion.numero_atencion})?`
            : `¿Enviar a ${nombreBreve(panel.paciente)} (${panel.atencion.numero_atencion}) a ${envio.etiqueta}?`}</p>
          {envio.destino !== "finalizar" && (
            <Campo etiqueta="Motivo (opcional)" value={motivo} maxLength={200} autoComplete="off" ayuda="Una frase breve para el área que lo recibe. No escriba diagnósticos: se ve en su lista de espera." onChange={(e) => setMotivo(e.target.value)} />
          )}
        </Dialogo>
      )}
    </div>
  );
}

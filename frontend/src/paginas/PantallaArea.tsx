import { PhoneCall } from "lucide-react";
import { type ReactNode, useCallback, useEffect, useRef, useState } from "react";
import { api, ErrorDeApi } from "../api/cliente";
import type { Cola, FilaCola, OpcionEnvio, PanelAtencion } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
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
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error" | "aviso"; texto: string } | null>(null);
  const [envio, setEnvio] = useState<OpcionEnvio | null>(null);
  const [motivo, setMotivo] = useState("");
  const [cargando, setCargando] = useState(false);
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
      <li key={f.id_recorrido_atencion} className={`fila-cola${f.es_emergencia ? " fila-cola--emergencia" : ""}`}>
        <div className="fila-cola__nombre">{nombre}</div>
        <div className="fila-cola__meta cifras">
          <span className="codigo">{f.codigo_paciente}</span><span className="codigo">{f.numero_atencion}</span>
          <span>{[edadDe(f), f.sexo === "F" ? "Mujer" : "Hombre"].filter(Boolean).join(" · ")}</span>
        </div>
        {!atendiendo && (
          <div className="fila-cola__accion">
            <Boton variante="acento" className="boton--pequeno" aria-label={`Atender a ${nombreBreve(f)} (${f.numero_atencion})`} disabled={cargando || Boolean(cola?.mi_atencion)} onClick={() => void llamar(f.id_atencion)}>Atender</Boton>
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
      </li>
    );
  };
  const otros = cola?.en_atencion.filter((f) => f.id_atencion !== cola.mi_atencion?.id_atencion) ?? [];

  const Ilustracion = ILUSTRACION_DE_AREA[clave];
  return (
    <div className="app" data-area={clave}>
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="encabezado-pantalla">
          <span className="encabezado-pantalla__il">{Ilustracion && <Ilustracion tamano={84} />}</span>
          <h1>{titulo}</h1>
          <Boton variante="acento" icono={<PhoneCall aria-hidden="true" size={22} />} onClick={() => void llamar()} cargando={cargando && !envio} disabled={Boolean(cola?.mi_atencion)}>Llamar siguiente</Boton>
        </div>
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

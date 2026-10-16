import { type FormEvent, useState } from "react";
import { api } from "../api/cliente";
import type { RenglonFarmacia } from "../api/tipos";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Dialogo } from "../componentes/Dialogo";
import { Mensaje } from "../componentes/Mensaje";
import { nombreBreve } from "../texto";
import { PantallaArea } from "./PantallaArea";

const nombre = (r: RenglonFarmacia) => `${r.medicamento} (${r.presentacion})`;

function Entrega({ idAtencion, quien, renglones, alTerminar }: { idAtencion: number; quien: string; renglones: RenglonFarmacia[]; alTerminar: (texto: string) => void }) {
  const pendientes = renglones.filter((r) => r.numero_orden === null);
  const [cant, setCant] = useState<Record<number, string>>(() => Object.fromEntries(pendientes.map((r) => [r.id_receta_detalle, String(r.cantidad_recetada)])));
  const [obs, setObs] = useState<Record<number, string>>({});
  const [recibe, setRecibe] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const [lineas, setLineas] = useState<{ id_receta_detalle: number; cantidad_entregada: number; observacion: string | null }[] | null>(null);

  // Valida y abre la confirmación; la entrega y el cierre se registran juntos al confirmar.
  const revisar = (e: FormEvent) => {
    e.preventDefault(); setError(null);
    const nuevas = [];
    for (const r of pendientes) {
      const t = (cant[r.id_receta_detalle] ?? "").trim();
      if (!/^\d{1,3}$/.test(t)) { setError(`Escriba la cantidad entregada de ${nombre(r)} (0 si no se entregó).`); return; }
      const n = Number(t);
      if (n > r.cantidad_recetada) { setError(`De ${nombre(r)} se recetaron ${r.cantidad_recetada}; no se puede entregar más.`); return; }
      if (n < r.cantidad_recetada && !(obs[r.id_receta_detalle] ?? "").trim()) { setError(`Escriba el motivo por el que no se entregó todo de ${nombre(r)}.`); return; }
      nuevas.push({ id_receta_detalle: r.id_receta_detalle, cantidad_entregada: n, observacion: (obs[r.id_receta_detalle] ?? "").trim() || null });
    }
    setLineas(nuevas);
  };

  const confirmar = async () => {
    if (!lineas) return;
    setCargando(true);
    try {
      await api.post(`/api/atenciones/${idAtencion}/entregas`, { recibido_por: recibe.trim() || null, lineas, finalizar: true });
      alTerminar(`Entrega registrada y atención de ${quien} finalizada.`);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo registrar la entrega."); }
    finally { setCargando(false); setLineas(null); }
  };

  return (
    <form onSubmit={revisar} noValidate aria-label="Entrega de medicamentos">
      {error && <Mensaje tipo="error">{error}</Mensaje>}
      {pendientes.map((r) => (
        <div className="renglon" key={r.id_receta_detalle}>
          <div className="campo"><strong>{nombre(r)}</strong><div className="campo__ayuda">Receta de {r.receta_de} · recetado: {r.cantidad_recetada} · {r.indicaciones}</div></div>
          <Campo etiqueta="Entregado" inputMode="numeric" value={cant[r.id_receta_detalle] ?? ""} onChange={(e) => setCant((a) => ({ ...a, [r.id_receta_detalle]: e.target.value }))} autoComplete="off" />
          <Campo etiqueta="Observación" value={obs[r.id_receta_detalle] ?? ""} onChange={(e) => setObs((a) => ({ ...a, [r.id_receta_detalle]: e.target.value }))} maxLength={300} autoComplete="off" ayuda="Obligatoria si falta algo." />
        </div>
      ))}
      <Campo etiqueta="Recibe (nombre, opcional)" value={recibe} onChange={(e) => setRecibe(e.target.value)} maxLength={120} autoComplete="off" />
      <Boton type="submit" cargando={cargando}>Entregar y finalizar atención</Boton>
      {lineas && (
        <Dialogo destino="finalizar" titulo="Entregar y finalizar" textoConfirmar="Entregar y finalizar" cargando={cargando} alConfirmar={() => void confirmar()} alCancelar={() => setLineas(null)}>
          <p>{`¿Registrar la entrega de medicamentos y finalizar la atención de ${quien}?`}</p>
        </Dialogo>
      )}
    </form>
  );
}

export function Farmacia() {
  return (
    <PantallaArea clave="farmacia" titulo="Farmacia" mostrarSignos={false}
      panelDelArea={(panel, _recargar, terminar) => {
        const e = panel.especifico;
        const hechos = (e?.renglones ?? []).filter((r) => r.numero_orden !== null);
        return (
          <>
            <h3>Medicamentos recetados</h3>
            {(e?.renglones ?? []).length === 0 && <p>Esta atención no tiene receta.</p>}
            {e?.pendiente && <Entrega key={`e-${panel.atencion.id_atencion}`} idAtencion={panel.atencion.id_atencion} quien={`${nombreBreve(panel.paciente)} (${panel.atencion.numero_atencion})`} renglones={e.renglones ?? []} alTerminar={(t) => void terminar(t)} />}
            {hechos.length > 0 && (
              <>
                <h3>Entregado</h3>
                <ul className="lista sin-vinetas">
                  {hechos.map((r) => (
                    <li key={r.id_receta_detalle}>Orden {String(r.numero_orden).padStart(6, "0")} · <strong>{nombre(r)}</strong> · entregado {r.cantidad_entregada} de {r.cantidad_recetada}
                      {r.cantidad_no_entregada ? ` (falta ${r.cantidad_no_entregada}: ${r.observacion})` : ""}{r.recibido_por ? ` · recibe ${r.recibido_por}` : ""}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        );
      }} />
  );
}

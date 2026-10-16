import type { Signos } from "../api/tipos";
import { Mensaje } from "./Mensaje";

const dato = (v: number | null, unidad = "") => (v === null || v === undefined ? "—" : `${v}${unidad}`);

export function ResumenSignos({ signos }: { signos: Signos | null }) {
  if (!signos) return <p>Todavía no se han tomado los signos vitales.</p>;
  return (
    <>
      {signos.hay_signos_peligro && <Mensaje tipo="error">Señales de peligro{signos.detalle_signos_peligro ? `: ${signos.detalle_signos_peligro}` : ""}</Mensaje>}
      <dl className="signos-resumen">
        <div><dt>Peso</dt><dd>{dato(signos.peso_lb, " lb")}</dd></div>
        <div><dt>Talla</dt><dd>{dato(signos.talla_cm, " cm")}</dd></div>
        <div><dt>IMC</dt><dd>{signos.imc ? `${signos.imc.imc}${signos.imc.categoria ? ` (${signos.imc.categoria})` : ""}` : "—"}</dd></div>
        <div><dt>Temperatura</dt><dd>{dato(signos.temperatura_c, " °C")}</dd></div>
        <div><dt>Presión arterial</dt><dd>{signos.presion_sistolica !== null ? `${signos.presion_sistolica}/${signos.presion_diastolica}` : "—"}</dd></div>
        <div><dt>Pulso</dt><dd>{dato(signos.frecuencia_cardiaca, " por minuto")}</dd></div>
        <div><dt>Saturación</dt><dd>{dato(signos.saturacion_oxigeno, " %")}</dd></div>
      </dl>
      <p className="signos-resumen__pie">Tomados {signos.registrado} por {signos.registrado_por}</p>
    </>
  );
}

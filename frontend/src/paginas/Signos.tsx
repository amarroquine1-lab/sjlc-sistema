import { FormularioSignos } from "../componentes/FormularioSignos";
import { PantallaArea } from "./PantallaArea";

export function Signos() {
  return (
    <PantallaArea clave="signos" titulo="Signos vitales" mostrarSignos
      panelDelArea={(panel, recargar) => (
        <>
          <h3>{panel.signos ? "Corregir signos vitales" : "Tomar signos vitales"}</h3>
          <FormularioSignos key={panel.signos?.id_signo_vital ?? "nuevo"} idAtencion={panel.atencion.id_atencion} inicial={panel.signos} alGuardar={() => void recargar()} />
        </>
      )} />
  );
}

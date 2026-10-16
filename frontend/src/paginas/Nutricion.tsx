import { EditorReceta } from "../componentes/EditorReceta";
import { FormularioEvaluacion } from "../componentes/FormularioEvaluacion";
import { ProximoControl } from "../componentes/ProximoControl";
import { PantallaArea } from "./PantallaArea";

export function Nutricion() {
  return (
    <PantallaArea clave="nutricion" titulo="Nutrición" mostrarSignos
      panelDelArea={(panel, recargar) => {
        const id = panel.atencion.id_atencion;
        const c = panel.clinico;
        return (
          <>
            {c?.consulta && <><h3>Diagnóstico del doctor</h3><p>{c.consulta.diagnosticos.map((d) => d.descripcion_diagnostico).join("; ") || "Sin diagnóstico registrado."}</p></>}
            <h3>{panel.especifico?.evaluacion ? "Corregir la evaluación nutricional" : "Evaluación nutricional"}</h3>
            <FormularioEvaluacion key={`e-${id}`} idAtencion={id} inicial={panel.especifico?.evaluacion ?? null} alGuardar={() => void recargar()} />
            <EditorReceta key={`r-${id}`} idAtencion={id} area="nutrición" vigente={c?.receta ?? []} alGuardar={() => void recargar()} />
            <ProximoControl key={`p-${id}`} idAtencion={id} controles={c?.proximos_controles ?? []} alGuardar={() => void recargar()} />
          </>
        );
      }} />
  );
}

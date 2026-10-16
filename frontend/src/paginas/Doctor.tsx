import type { Clinico } from "../api/tipos";
import { EditorReceta } from "../componentes/EditorReceta";
import { FormularioConsulta } from "../componentes/FormularioConsulta";
import { ProximoControl } from "../componentes/ProximoControl";
import { PantallaArea } from "./PantallaArea";

export function ResumenHistorial({ clinico }: { clinico: Clinico }) {
  if (clinico.historial_resumido.length === 0) return <p>Sin visitas anteriores registradas.</p>;
  return (
    <ul className="lista sin-vinetas">
      {clinico.historial_resumido.map((h) => (
        <li key={h.numero_atencion}><strong>{h.fecha}</strong> · {h.tipo} ({h.numero_atencion}){h.diagnosticos ? ` · ${h.diagnosticos}` : h.motivo_consulta ? ` · ${h.motivo_consulta}` : ""}</li>
      ))}
    </ul>
  );
}

export function Doctor() {
  return (
    <PantallaArea clave="doctor" titulo="Consulta médica" mostrarSignos
      panelDelArea={(panel, recargar) => {
        const c = panel.clinico;
        if (!c) return null;
        const id = panel.atencion.id_atencion;
        return (
          <>
            <h3>Visitas anteriores</h3>
            <ResumenHistorial clinico={c} />
            <h3>Consulta</h3>
            <FormularioConsulta key={`c-${id}`} idAtencion={id} inicial={c.consulta} esMujer={panel.paciente.sexo === "F"} alGuardar={() => void recargar()} />
            <EditorReceta key={`r-${id}`} idAtencion={id} area="doctor" vigente={c.receta} alGuardar={() => void recargar()} />
            <ProximoControl key={`p-${id}`} idAtencion={id} controles={c.proximos_controles} alGuardar={() => void recargar()} />
          </>
        );
      }} />
  );
}

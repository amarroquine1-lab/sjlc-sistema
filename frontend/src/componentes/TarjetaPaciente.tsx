import type { ReactNode } from "react";
import { Estado } from "./Estado";

export interface PacienteResumen {
  codigo_paciente: string; nombres: string | null; apellidos: string | null; edad?: string | null; sexo?: string;
  estado?: string; numero_atencion?: string; es_emergencia?: boolean; datos_incompletos?: boolean;
}

export function TarjetaPaciente({ paciente, acciones }: { paciente: PacienteResumen; acciones?: ReactNode }) {
  const nombre = [paciente.nombres, paciente.apellidos].filter(Boolean).join(" ") || "Sin identificar";
  return (
    <article className="paciente">
      <div className="paciente__nombre">{nombre}</div>
      <div className="paciente__datos cifras">
        <span className="codigo">{paciente.codigo_paciente}</span>
        {paciente.numero_atencion && <> · <span className="codigo">{paciente.numero_atencion}</span></>}
        {paciente.edad && <> · {paciente.edad}</>}
        {paciente.sexo && <> · {paciente.sexo === "F" ? "Mujer" : "Hombre"}</>}
      </div>
      <div className="etiquetas">
        {paciente.es_emergencia && <Estado valor="emergencia" />} {paciente.estado && <Estado valor={paciente.estado} />}
        {paciente.datos_incompletos && <> <span className="estado estado--en_espera">Datos incompletos</span></>}
      </div>
      {acciones}
    </article>
  );
}

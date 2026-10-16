import type { ReactNode } from "react";
import { FamiliaEnEspera } from "../ilustraciones/Ilustraciones";

// Estado vacío: una ilustración de la sala de espera y qué hacer a continuación.
export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="vacio">
      <FamiliaEnEspera tamano={96} />
      <div><strong>{titulo}</strong>{children && <p>{children}</p>}</div>
    </div>
  );
}

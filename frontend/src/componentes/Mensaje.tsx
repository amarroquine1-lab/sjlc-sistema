import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import type { ReactNode } from "react";

const ICONOS = { error: XCircle, exito: CheckCircle2, aviso: AlertTriangle, info: Info } as const;

// El tipo se distingue por el ícono, el color y el texto; nunca solo por el color.
export function Mensaje({ tipo, children }: { tipo: "error" | "exito" | "aviso" | "info"; children: ReactNode }) {
  const Icono = ICONOS[tipo];
  return (
    <div className={`mensaje mensaje--${tipo}`} role={tipo === "error" ? "alert" : "status"}>
      <Icono aria-hidden="true" size={22} />
      <div className="mensaje__texto">{children}</div>
    </div>
  );
}

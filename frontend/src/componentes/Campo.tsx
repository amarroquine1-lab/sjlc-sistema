import { useId, type InputHTMLAttributes, type ReactNode } from "react";

interface Props extends InputHTMLAttributes<HTMLInputElement> {
  etiqueta: string;
  ayuda?: string;
  error?: string | null;
  accion?: ReactNode;
}

export function Campo({ etiqueta, ayuda, error, accion, id, ...resto }: Props) {
  const auto = useId();
  const idCampo = id ?? auto;
  const describedBy = [ayuda ? `${idCampo}-ayuda` : "", error ? `${idCampo}-error` : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`campo${error ? " campo--error" : ""}`}>
      <label htmlFor={idCampo}>{etiqueta}</label>
      <div className="campo__fila">
        <input id={idCampo} aria-describedby={describedBy} aria-invalid={error ? true : undefined} {...resto} />
        {accion}
      </div>
      {ayuda && <div id={`${idCampo}-ayuda`} className="campo__ayuda">{ayuda}</div>}
      {error && <div id={`${idCampo}-error`} className="campo__error">{error}</div>}
    </div>
  );
}

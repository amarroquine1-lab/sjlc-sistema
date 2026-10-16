import { useId, type ComponentProps } from "react";

interface Props extends ComponentProps<"textarea"> { etiqueta: string; ayuda?: string; error?: string | null }

export function AreaTexto({ etiqueta, ayuda, error, id, ...resto }: Props) {
  const auto = useId();
  const idCampo = id ?? auto;
  return (
    <div className={`campo campo--texto${error ? " campo--error" : ""}`}>
      <label htmlFor={idCampo}>{etiqueta}</label>
      <textarea id={idCampo} rows={3} aria-invalid={error ? true : undefined} aria-describedby={ayuda ? `${idCampo}-ayuda` : undefined} {...resto} />
      {ayuda && <div id={`${idCampo}-ayuda`} className="campo__ayuda">{ayuda}</div>}
      {error && <div className="campo__error">{error}</div>}
    </div>
  );
}

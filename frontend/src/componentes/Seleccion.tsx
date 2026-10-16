import { useId, type ComponentProps } from "react";

interface Props extends ComponentProps<"select"> { etiqueta: string; ayuda?: string; error?: string | null; opciones: { valor: string | number; texto: string }[]; vacio?: string }

export function Seleccion({ etiqueta, ayuda, error, opciones, vacio, id, ...resto }: Props) {
  const auto = useId();
  const idCampo = id ?? auto;
  return (
    <div className={`campo${error ? " campo--error" : ""}`}>
      <label htmlFor={idCampo}>{etiqueta}</label>
      <select id={idCampo} aria-invalid={error ? true : undefined} aria-describedby={ayuda ? `${idCampo}-ayuda` : undefined} {...resto}>
        {vacio !== undefined && <option value="">{vacio}</option>}
        {opciones.map((o) => <option key={o.valor} value={o.valor}>{o.texto}</option>)}
      </select>
      {ayuda && <div id={`${idCampo}-ayuda`} className="campo__ayuda">{ayuda}</div>}
      {error && <div className="campo__error">{error}</div>}
    </div>
  );
}

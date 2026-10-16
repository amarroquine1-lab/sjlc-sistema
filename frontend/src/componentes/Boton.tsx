import type { ComponentProps, ReactNode } from "react";

interface Props extends ComponentProps<"button"> {
  variante?: "primario" | "secundario" | "acento" | "peligro";
  grande?: boolean;
  cargando?: boolean;
  icono?: ReactNode;
}

export function Boton({ variante = "primario", grande, cargando, icono, children, disabled, className = "", ...resto }: Props) {
  const clases = ["boton", variante !== "primario" ? `boton--${variante}` : "", grande ? "boton--grande" : "", className].filter(Boolean).join(" ");
  return (
    <button type="button" className={clases} disabled={disabled || cargando} aria-busy={cargando || undefined} {...resto}>
      {icono}
      <span>{cargando ? "Un momento…" : children}</span>
    </button>
  );
}

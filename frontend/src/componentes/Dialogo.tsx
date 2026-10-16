import { useEffect, useRef, type ReactNode } from "react";
import { Boton } from "./Boton";

interface Props {
  titulo: string;
  children: ReactNode;
  textoConfirmar: string;
  textoCancelar?: string;
  peligro?: boolean;
  /** Área de destino al enviar: el diálogo y su botón toman su color. */
  destino?: string;
  cargando?: boolean;
  alConfirmar: () => void;
  alCancelar: () => void;
}

// Confirmación modal: el texto debe nombrar lo afectado ("¿Enviar a María L. (A-004587) a Farmacia?").
export function Dialogo({ titulo, children, textoConfirmar, textoCancelar = "Cancelar", peligro, destino, cargando, alConfirmar, alCancelar }: Props) {
  const cancelar = useRef<HTMLButtonElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    cancelar.current?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") alCancelar();
      if (e.key === "Tab" && contenedor.current) {
        const foco = contenedor.current.querySelectorAll<HTMLElement>("button:not([disabled])");
        if (foco.length === 0) return;
        const primero = foco[0], ultimo = foco[foco.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => { document.removeEventListener("keydown", alTeclear); previo?.focus(); };
  }, [alCancelar]);
  return (
    <div className="dialogo-fondo">
      <div className="dialogo" data-destino={destino} role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" ref={contenedor}>
        <h2 id="dialogo-titulo">{titulo}</h2>
        <div>{children}</div>
        <div className="dialogo__acciones">
          <Boton variante="secundario" onClick={alCancelar} ref={cancelar}>{textoCancelar}</Boton>
          <Boton variante={peligro ? "peligro" : "primario"} data-destino={destino} onClick={alConfirmar} cargando={cargando}>{textoConfirmar}</Boton>
        </div>
      </div>
    </div>
  );
}

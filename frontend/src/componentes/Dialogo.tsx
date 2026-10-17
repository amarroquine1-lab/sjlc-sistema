import { useEffect, useRef, type ReactNode } from "react";
import { Boton } from "./Boton";

interface Props {
  titulo: string;
  children: ReactNode;
  /** Sin texto ni acción de confirmar, el diálogo es solo informativo (solo el botón de cerrar). */
  textoConfirmar?: string;
  textoCancelar?: string;
  /** Botones adicionales entre cerrar y confirmar. */
  acciones?: ReactNode;
  peligro?: boolean;
  /** Área de destino al enviar: el diálogo y su botón toman su color. */
  destino?: string;
  cargando?: boolean;
  /** Mantiene apagado el botón de confirmar (por ejemplo, hasta escribir el nombre). */
  confirmarDeshabilitado?: boolean;
  alConfirmar?: () => void;
  alCancelar: () => void;
}

// Confirmación modal: el texto debe nombrar lo afectado ("¿Enviar a María L. (A-004587) a Farmacia?").
export function Dialogo({ titulo, children, textoConfirmar, textoCancelar = "Cancelar", acciones, peligro, destino, cargando, confirmarDeshabilitado, alConfirmar, alCancelar }: Props) {
  const cancelar = useRef<HTMLButtonElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  // Las funciones llegan nuevas en cada render del padre: se guardan en una referencia para que el efecto corra una sola vez.
  // Si dependiera de ellas, cada letra escrita en un campo volvería a mover el foco al botón Cancelar.
  const cancelarAhora = useRef(alCancelar);
  cancelarAhora.current = alCancelar;
  useEffect(() => {
    const previo = document.activeElement as HTMLElement | null;
    // Al abrir, el foco va al primer campo de texto (si lo hay) y si no, a Cancelar.
    (contenedor.current?.querySelector<HTMLElement>("input:not([disabled]), textarea:not([disabled]), select:not([disabled])") ?? cancelar.current)?.focus();
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancelarAhora.current();
      if (e.key === "Tab" && contenedor.current) {
        const foco = contenedor.current.querySelectorAll<HTMLElement>("button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled])");
        if (foco.length === 0) return;
        const primero = foco[0], ultimo = foco[foco.length - 1];
        if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus(); }
        else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus(); }
      }
    };
    document.addEventListener("keydown", alTeclear);
    return () => { document.removeEventListener("keydown", alTeclear); previo?.focus(); };
  }, []);
  return (
    <div className="dialogo-fondo">
      <div className="dialogo" data-destino={destino} role="alertdialog" aria-modal="true" aria-labelledby="dialogo-titulo" ref={contenedor}>
        <h2 id="dialogo-titulo">{titulo}</h2>
        <div>{children}</div>
        <div className="dialogo__acciones">
          <Boton variante="secundario" onClick={alCancelar} ref={cancelar}>{textoCancelar}</Boton>
          {acciones}
          {alConfirmar && textoConfirmar && <Boton variante={peligro ? "peligro" : "primario"} data-destino={destino} onClick={alConfirmar} cargando={cargando} disabled={confirmarDeshabilitado}>{textoConfirmar}</Boton>}
        </div>
      </div>
    </div>
  );
}

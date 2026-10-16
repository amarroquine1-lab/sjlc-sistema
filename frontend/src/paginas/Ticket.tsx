import QRCode from "qrcode";
import { Printer } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api } from "../api/cliente";
import logoBn from "../recursos/marca/mspas-bn.png";
import type { Ticket as DatosTicket } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Mensaje } from "../componentes/Mensaje";
import { capitalizar } from "../texto";

// Ticket para la impresora térmica de 80 mm (se imprime desde el navegador con CSS @media print).
// Lleva el número de atención en un código QR (el lector de las áreas debe ser 2D) y escrito debajo; nunca el DPI ni datos sensibles.
export function Ticket() {
  const { id } = useParams();
  const navegar = useNavigate();
  const [t, setT] = useState<DatosTicket | null>(null);
  const [error, setError] = useState<string | null>(null);
  const lienzo = useRef<HTMLCanvasElement>(null);

  useEffect(() => { api.get<DatosTicket>(`/api/atenciones/${id}/ticket`).then(setT).catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el ticket.")); }, [id]);
  useEffect(() => {
    if (t && lienzo.current) void QRCode.toCanvas(lienzo.current, t.codigo_barras, { errorCorrectionLevel: "M", margin: 0, width: 240 });
  }, [t]);

  return (
    <div className="app" data-area="recepcion">
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="encabezado-pantalla no-imprimir">
          <h1>Ticket de atención</h1>
          <Boton icono={<Printer aria-hidden="true" size={22} />} onClick={() => window.print()} disabled={!t}>Imprimir ticket</Boton>
          <Boton variante="secundario" onClick={() => navegar("/recepcion")}>Volver a recepción</Boton>
        </div>
        {error && <Mensaje tipo="error">{error}</Mensaje>}
        {t && (
          <article className="ticket" aria-label="Ticket de atención">
            <img className="ticket__logo" src={logoBn} width={920} height={832} alt="Ministerio de Salud Pública y Asistencia Social, Guatemala" />
            <h2>{t.centro}</h2>
            {t.es_emergencia && <div className="ticket__emergencia">EMERGENCIA</div>}
            <canvas ref={lienzo} className="ticket__qr" role="img" aria-label={`Código QR de la atención ${t.codigo_barras}`} />
            <div className="ticket__grande">{t.numero_atencion}</div>
            <div className="ticket__fila"><span>Paciente</span><strong>{t.codigo_paciente}</strong></div>
            <div className="ticket__fila"><span>Nombre</span><strong>{t.nombre}</strong></div>
            <div className="ticket__fila"><span>Atención</span><strong>{capitalizar(t.tipo)}</strong></div>
            <div className="ticket__fila"><span>Llegada</span><strong>{t.fecha_hora}</strong></div>
            <div className="ticket__pie">Conserve este ticket mientras espera.</div>
          </article>
        )}
      </main>
    </div>
  );
}

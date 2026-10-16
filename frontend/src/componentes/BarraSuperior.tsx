import { Home, LogOut } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import logoMspas from "../recursos/marca/mspas-logo.webp";
import { capitalizar, claveDeArea } from "../texto";
import { useSesion } from "../sesion/ContextoSesion";
import { Boton } from "./Boton";

const formato = new Intl.DateTimeFormat("es-GT", { timeZone: "America/Guatemala", weekday: "long", day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });

export function BarraSuperior() {
  const { yo, salir } = useSesion();
  const [ahora, setAhora] = useState(() => new Date());
  useEffect(() => { const t = window.setInterval(() => setAhora(new Date()), 30000); return () => window.clearInterval(t); }, []);
  if (!yo) return null;
  return (
    <>
    <a href="#contenido" className="saltar">Saltar al contenido</a>
    <header className="barra">
      <div className="barra__marca">
        <img className="barra__logo" src={logoMspas} width={64} height={58} alt="Gobierno de Guatemala, Ministerio de Salud Pública y Asistencia Social" />
        <div className="barra__nombre">Centro de Salud San José La Comunidad<small>Expedientes clínicos · zona 10, Mixco</small></div>
      </div>
      <div className="barra__usuario"><strong>{yo.nombres} {yo.apellidos}</strong><span className="barra__area" data-area={claveDeArea(yo.area) ?? "recepcion"}>{capitalizar(yo.area ?? "administración")}</span></div>
      <div className="barra__hora cifras" aria-label="Fecha y hora del centro"><span>{formato.format(ahora)}</span></div>
      <Link to="/" className="boton boton--secundario"><Home aria-hidden="true" size={22} /><span>Inicio</span></Link>
      <Boton icono={<LogOut aria-hidden="true" size={22} />} onClick={() => void salir()}>Salir</Boton>
    </header>
    </>
  );
}

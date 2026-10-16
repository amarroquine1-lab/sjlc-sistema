import { ArrowRight, FileBarChart, History, ListOrdered, ScrollText, Users } from "lucide-react";
import type { ComponentType } from "react";
import { Link } from "react-router-dom";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { ILUSTRACION_DE_AREA } from "../ilustraciones/Ilustraciones";
import { modulosDe, type Modulo } from "../modulos";
import { useSesion } from "../sesion/ContextoSesion";
import { capitalizar } from "../texto";

const ICONOS: Record<string, ComponentType<{ size?: number; "aria-hidden"?: "true" }>> = {
  historial: History, usuarios: Users, bitacora: ScrollText, colas: ListOrdered, reportes: FileBarChart,
};

// Las seis áreas llevan su color y su ilustración; las demás entradas son filas sencillas con un ícono pequeño.
function TarjetaArea({ m }: { m: Modulo }) {
  const Ilustracion = ILUSTRACION_DE_AREA[m.id];
  const cuerpo = (
    <>
      <div className="area-tarjeta__il">{Ilustracion && <Ilustracion tamano={148} />}</div>
      <div className="area-tarjeta__cuerpo">
        <h3 className="area-tarjeta__titulo">{m.titulo}</h3>
        <span className="area-tarjeta__texto">{m.descripcion}</span>
        {m.disponible ? <span className="area-tarjeta__entrar">Entrar <ArrowRight size={18} aria-hidden="true" /></span> : <span className="etiqueta-pronto">Disponible próximamente</span>}
      </div>
    </>
  );
  return <li>{m.disponible ? <Link to={m.ruta} className="area-tarjeta" data-area={m.id}>{cuerpo}</Link> : <div className="area-tarjeta" data-area={m.id} aria-disabled="true">{cuerpo}</div>}</li>;
}

function Fila({ m }: { m: Modulo }) {
  const Icono = ICONOS[m.id] ?? History;
  const contenido = (
    <>
      <Icono size={22} aria-hidden="true" />
      <div><h3 className="acceso__titulo">{m.titulo}</h3><span className="acceso__texto">{m.descripcion}</span></div>
      {m.disponible ? <ArrowRight className="acceso__flecha" size={20} aria-hidden="true" /> : <span className="etiqueta-pronto">Disponible próximamente</span>}
    </>
  );
  return <li>{m.disponible ? <Link to={m.ruta} className="acceso">{contenido}</Link> : <div className="acceso acceso--pronto" aria-disabled="true">{contenido}</div>}</li>;
}

export function Inicio() {
  const { yo } = useSesion();
  if (!yo) return null;
  const modulos = modulosDe(yo.rol);
  const esAdmin = yo.rol === "administrador";
  const areas = modulos.filter((m) => m.grupo === "area");
  const consultas = modulos.filter((m) => m.grupo === "consulta");
  const admin = modulos.filter((m) => m.grupo === "administracion");
  return (
    <div className="app">
      <BarraSuperior />
      <AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="inicio__saludo">
          <h1>Hola, {yo.nombres.split(" ")[0]}</h1>
          <p>{yo.area ? `Su área: ${capitalizar(yo.area)}.` : "Administración del sistema."} Elija con qué quiere trabajar.</p>
        </div>
        {areas.length > 0 && (
          <section className="grupo" aria-label={esAdmin ? "Áreas de atención" : "Su área"}>
            <h2 className="grupo__titulo">{esAdmin ? "Áreas de atención" : "Su área"}</h2>
            <ul className={`areas${areas.length === 1 ? " areas--una" : ""}`}>{areas.map((m) => <TarjetaArea key={m.id} m={m} />)}</ul>
          </section>
        )}
        {consultas.length > 0 && (
          <section className="grupo" aria-label="Consultas">
            <h2 className="grupo__titulo">Consultas</h2>
            <ul className="accesos">{consultas.map((m) => <Fila key={m.id} m={m} />)}</ul>
          </section>
        )}
        {admin.length > 0 && (
          <section className="grupo" aria-label="Administración">
            <h2 className="grupo__titulo">Administración</h2>
            <ul className="accesos">{admin.map((m) => <Fila key={m.id} m={m} />)}</ul>
          </section>
        )}
      </main>
    </div>
  );
}

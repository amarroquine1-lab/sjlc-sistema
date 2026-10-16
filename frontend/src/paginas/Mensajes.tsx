import { Link } from "react-router-dom";
import { BarraSuperior } from "../componentes/BarraSuperior";

export function NoAutorizado() {
  return (<><BarraSuperior /><main id="contenido" tabIndex={-1} className="pagina"><h1>No tiene acceso a esta pantalla</h1><p>Su usuario no tiene permiso para entrar aquí.</p><Link to="/">Volver al inicio</Link></main></>);
}
export function NoEncontrada() {
  return (<><BarraSuperior /><main id="contenido" tabIndex={-1} className="pagina"><h1>Esa pantalla no existe</h1><p>Revise la dirección o vuelva al inicio.</p><Link to="/">Volver al inicio</Link></main></>);
}

import { useSesion } from "../sesion/ContextoSesion";
import { Boton } from "./Boton";
import { Mensaje } from "./Mensaje";

export function AvisoVencimiento() {
  const { avisoVencimiento, seguirTrabajando } = useSesion();
  if (!avisoVencimiento) return null;
  return (
    <div className="pagina">
      <Mensaje tipo="aviso">
        Su sesión se cerrará en 2 minutos por inactividad. <Boton variante="secundario" onClick={seguirTrabajando}>Seguir trabajando</Boton>
      </Mensaje>
    </div>
  );
}

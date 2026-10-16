import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { api } from "../api/cliente";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Mensaje } from "../componentes/Mensaje";
import { useSesion } from "../sesion/ContextoSesion";

export function CambioContrasena() {
  const { yo, recargar } = useSesion();
  const navegar = useNavigate();
  const [actual, setActual] = useState("");
  const [nueva, setNueva] = useState("");
  const [repetida, setRepetida] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  if (!yo) return <Navigate to="/ingreso" replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (nueva !== repetida) { setError("La contraseña nueva y su repetición no coinciden."); return; }
    setCargando(true);
    try {
      await api.post("/api/autenticacion/cambiar-contrasena", { contrasena_actual: actual, contrasena_nueva: nueva });
      await recargar();
      navegar("/", { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo cambiar la contraseña.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <>
      <BarraSuperior />
      <main id="contenido" tabIndex={-1} className="pagina pagina--estrecha">
        <form className="tarjeta" onSubmit={enviar} noValidate>
          <h1>{yo.debe_cambiar_contrasena ? "Elija su contraseña" : "Cambiar contraseña"}</h1>
          {yo.debe_cambiar_contrasena && <Mensaje tipo="info">Por seguridad debe cambiar la contraseña temporal antes de continuar.</Mensaje>}
          {error && <Mensaje tipo="error">{error}</Mensaje>}
          <Campo etiqueta="Contraseña actual (la temporal)" type="password" autoComplete="current-password" value={actual} onChange={(e) => setActual(e.target.value)} />
          <Campo etiqueta="Contraseña nueva" type="password" autoComplete="new-password" value={nueva} onChange={(e) => setNueva(e.target.value)}
            ayuda="Mínimo 10 caracteres. No puede llevar su usuario ni ser una contraseña común." />
          <Campo etiqueta="Repita la contraseña nueva" type="password" autoComplete="new-password" value={repetida} onChange={(e) => setRepetida(e.target.value)} />
          <Boton type="submit" cargando={cargando}>Guardar contraseña</Boton>
        </form>
      </main>
    </>
  );
}

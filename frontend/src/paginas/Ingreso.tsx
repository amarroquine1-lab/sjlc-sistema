import { type FormEvent, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ErrorDeApi } from "../api/cliente";
import { CentroYComunidad } from "../ilustraciones/Ilustraciones";
import logoMspas from "../recursos/marca/mspas-logo.webp";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Mensaje } from "../componentes/Mensaje";
import { useSesion } from "../sesion/ContextoSesion";

export function Ingreso() {
  const { yo, ingresar, motivoSalida } = useSesion();
  const navegar = useNavigate();
  const [usuario, setUsuario] = useState("");
  const [contrasena, setContrasena] = useState("");
  const [ver, setVer] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);

  if (yo) return <Navigate to={yo.debe_cambiar_contrasena ? "/cambiar-contrasena" : "/"} replace />;

  const enviar = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!usuario.trim() || !contrasena) { setError("Escriba su usuario y su contraseña."); return; }
    setCargando(true);
    try {
      const u = await ingresar(usuario.trim().toLowerCase(), contrasena);
      navegar(u.debe_cambiar_contrasena ? "/cambiar-contrasena" : "/", { replace: true });
    } catch (err) {
      setError(err instanceof ErrorDeApi && err.info.codigo === "DATOS_INVALIDOS"
        ? "El usuario solo lleva letras minúsculas, sin espacios, tildes ni números."
        : err instanceof Error ? err.message : "No se pudo ingresar.");
    } finally {
      setCargando(false);
    }
  };

  return (
    <main className="ingreso">
      <section className="ingreso__lado" aria-label="Centro de Salud">
        <div className="ingreso__marca">
          <div className="ingreso__logo"><img src={logoMspas} width={102} height={92} alt="Gobierno de Guatemala, Ministerio de Salud Pública y Asistencia Social" /></div>
          <h1>Centro de Salud San José La Comunidad</h1>
        </div>
        <div className="ingreso__portada"><CentroYComunidad ancho={600} /></div>
      </section>
      <div className="ingreso__formulario">
        <form onSubmit={enviar} noValidate>
          <h2>Ingresar</h2>
          <p className="ingreso__sub">Expedientes clínicos · zona 10, Mixco</p>
          {motivoSalida && <Mensaje tipo="aviso">{motivoSalida}</Mensaje>}
          {error && <Mensaje tipo="error">{error}</Mensaje>}
          <Campo etiqueta="Usuario" name="usuario" autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false}
            value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus ayuda="Inicial de su nombre y su apellido, en minúsculas. Ejemplo: rlopez." />
          <Campo etiqueta="Contraseña" name="contrasena" type={ver ? "text" : "password"} autoComplete="current-password"
            value={contrasena} onChange={(e) => setContrasena(e.target.value)}
            accion={<Boton variante="secundario" onClick={() => setVer(!ver)} aria-pressed={ver}>{ver ? "Ocultar" : "Mostrar"}</Boton>} />
          <Boton type="submit" grande cargando={cargando}>Ingresar</Boton>
          <p className="ingreso__ayuda">¿Olvidó su contraseña? Pida a un administrador que se la restablezca.</p>
        </form>
      </div>
    </main>
  );
}

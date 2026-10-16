import { type FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/cliente";
import type { Paciente } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Dialogo } from "../componentes/Dialogo";
import { Mensaje } from "../componentes/Mensaje";
import { nombreBreve } from "../texto";

// Registro rápido: sexo, edad aproximada y nombre si se conoce. Entra directo al doctor y queda en "datos incompletos".
export function Emergencia() {
  const navegar = useNavigate();
  const [sexo, setSexo] = useState("");
  const [edad, setEdad] = useState("");
  const [nombres, setNombres] = useState("");
  const [apellidos, setApellidos] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [cargando, setCargando] = useState(false);

  const revisar = (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (!sexo) return setError("Indique el sexo.");
    if (edad === "" || Number(edad) < 0 || Number(edad) > 120) return setError("Escriba la edad aproximada en años (de 0 a 120).");
    setConfirmar(true);
  };
  const registrar = async () => {
    setCargando(true);
    try {
      const r = await api.post<{ paciente: Paciente; id_atencion: number }>("/api/pacientes/emergencia", {
        sexo, edad_aproximada_anios: Number(edad), nombres: nombres.trim() || null, apellidos: apellidos.trim() || null });
      navegar("/recepcion", { state: { seleccionar: r.paciente.id_paciente, mensaje: `Emergencia registrada: ${r.paciente.atencion_abierta?.numero_atencion}. Pasó directo al doctor.`, ticket: r.id_atencion } });
    } catch (e) { setConfirmar(false); setError(e instanceof Error ? e.message : "No se pudo registrar la emergencia."); }
    finally { setCargando(false); }
  };
  const resumen = nombres.trim() ? nombreBreve({ nombres, apellidos }) : `${sexo === "F" ? "mujer" : "hombre"} de unos ${edad} años`;

  return (
    <div className="app" data-area="emergencia">
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="encabezado-pantalla"><h1>Emergencia</h1><Boton variante="secundario" onClick={() => navegar("/recepcion")}>Volver a recepción</Boton></div>
        <Mensaje tipo="info">Registro rápido: solo lo que se sabe. Los datos faltantes se completan después y queda en la lista de datos incompletos.</Mensaje>
        {error && <Mensaje tipo="error">{error}</Mensaje>}
        <form className="panel formulario-registro formulario-registro--angosto" onSubmit={revisar} noValidate>
          <div className="formulario-registro__cuerpo">
          <div className="campo">
            <label htmlFor="em-f">Sexo</label>
            <div className="opciones" role="radiogroup" aria-label="Sexo">
              <label className="opcion"><input id="em-f" type="radio" name="sexo" checked={sexo === "F"} onChange={() => setSexo("F")} />Mujer</label>
              <label className="opcion"><input type="radio" name="sexo" checked={sexo === "M"} onChange={() => setSexo("M")} />Hombre</label>
            </div>
          </div>
          <Campo etiqueta="Edad aproximada (años)" type="number" inputMode="numeric" min={0} max={120} value={edad} onChange={(e) => setEdad(e.target.value)} />
          <Campo etiqueta="Nombres (si se conocen)" value={nombres} onChange={(e) => setNombres(e.target.value)} autoComplete="off" />
          <Campo etiqueta="Apellidos (si se conocen)" value={apellidos} onChange={(e) => setApellidos(e.target.value)} autoComplete="off" />
          </div>
          <div className="acciones acciones--fijas"><Boton type="submit" variante="peligro">Registrar emergencia</Boton><Boton variante="secundario" onClick={() => navegar("/recepcion")}>Cancelar</Boton></div>
        </form>
      </main>
      {confirmar && (
        <Dialogo titulo="¿Registrar la emergencia?" textoConfirmar="Registrar y enviar al doctor" peligro cargando={cargando} alConfirmar={() => void registrar()} alCancelar={() => setConfirmar(false)}>
          <p>Se registrará a {resumen} y pasará directo al doctor.</p>
        </Dialogo>
      )}
    </div>
  );
}

import { Printer } from "lucide-react";
import { type FormEvent, useState } from "react";
import { api } from "../api/cliente";
import logoBn from "../recursos/marca/mspas-bn.png";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Mensaje } from "../componentes/Mensaje";
import { Seleccion } from "../componentes/Seleccion";

interface Reporte {
  tipo: string; titulo: string; descripcion: string; provisional: boolean; desde: string; hasta: string; generado: string; truncado: boolean;
  columnas: { clave: string; titulo: string; numerica?: boolean }[]; filas: Record<string, string | number | null>[];
}

const TIPOS = [
  { valor: "atenciones", texto: "Atenciones por día o mes y tipo", agrupa: true },
  { valor: "pacientes-por-area", texto: "Pacientes atendidos por área", agrupa: true },
  { valor: "tiempos-espera", texto: "Tiempos de espera por área", agrupa: true },
  { valor: "medicamentos-entregados", texto: "Medicamentos entregados (provisional)", agrupa: false },
  { valor: "vacunas-aplicadas", texto: "Vacunas aplicadas (provisional)", agrupa: false },
  { valor: "consultas-diarias", texto: "Registro diario de consultas (provisional)", agrupa: false },
];
const fmt = (iso: string) => iso.split("-").reverse().join("/");
const hoy = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };
const haceUnMes = () => { const d = new Date(); d.setDate(d.getDate() - 30); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; };

// Reportes de lectura para administradores; se imprimen en carta, en blanco y negro (CSS de impresión).
export function Reportes() {
  const [f, setF] = useState({ tipo: "atenciones", desde: haceUnMes(), hasta: hoy(), agrupar: "day" });
  const [r, setR] = useState<Reporte | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [cargando, setCargando] = useState(false);
  const agrupa = TIPOS.find((t) => t.valor === f.tipo)?.agrupa;

  const generar = async (e: FormEvent) => {
    e.preventDefault(); setError(null);
    if (!f.desde || !f.hasta) { setError("Elija las dos fechas."); return; }
    if (f.hasta < f.desde) { setError("La fecha final no puede ser anterior a la inicial."); return; }
    setCargando(true);
    try { setR(await api.get<Reporte>(`/api/reportes/${f.tipo}?desde=${f.desde}&hasta=${f.hasta}&agrupar=${agrupa ? f.agrupar : "day"}`)); }
    catch (err) { setR(null); setError(err instanceof Error ? err.message : "No se pudo generar el reporte."); }
    finally { setCargando(false); }
  };

  return (
    <>
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="no-imprimir">
          <h1>Reportes</h1>
          <form onSubmit={generar} aria-label="Filtros del reporte" noValidate>
            <div className="rejilla-formulario">
              <Seleccion etiqueta="Reporte" value={f.tipo} onChange={(e) => setF({ ...f, tipo: e.target.value })} opciones={TIPOS.map((t) => ({ valor: t.valor, texto: t.texto }))} />
              {agrupa ? <Seleccion etiqueta="Agrupar por" value={f.agrupar} onChange={(e) => setF({ ...f, agrupar: e.target.value })} opciones={[{ valor: "day", texto: "Día" }, { valor: "month", texto: "Mes" }]} /> : <span />}
              <Campo etiqueta="Desde" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
              <Campo etiqueta="Hasta" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} ayuda="Máximo un año." />
            </div>
            <div className="acciones">
              <Boton type="submit" cargando={cargando}>Generar reporte</Boton>
              {r && <Boton type="button" variante="secundario" icono={<Printer aria-hidden="true" size={22} />} onClick={() => window.print()}>Imprimir</Boton>}
            </div>
          </form>
          {error && <Mensaje tipo="error">{error}</Mensaje>}
        </div>
        {r && (
          <article className="reporte" aria-label="Reporte">
            <header className="reporte__encabezado">
              <div className="reporte__marca"><img className="reporte__logo" src={logoBn} width={920} height={832} alt="Ministerio de Salud Pública y Asistencia Social, Guatemala" /><p className="reporte__centro">Centro de Salud San José La Comunidad · zona 10, Mixco</p></div>
              <h2>{r.titulo}{r.provisional ? " (provisional)" : ""}</h2>
              <p>Del {fmt(r.desde)} al {fmt(r.hasta)} · generado el {r.generado}</p>
              <p className="reporte__nota">{r.descripcion}</p>
            </header>
            {r.filas.length === 0 ? <p>No hay datos en el rango elegido.</p> : (
              <div className="tabla-desplazable" tabIndex={0} role="region" aria-label="Tabla del reporte"><table className="tabla tabla--reporte">
                <thead><tr>{r.columnas.map((c) => <th key={c.clave} scope="col" className={c.numerica ? "num" : undefined}>{c.titulo}</th>)}</tr></thead>
                <tbody>{r.filas.map((fila, i) => <tr key={i}>{r.columnas.map((c) => <td key={c.clave} className={c.numerica ? "num" : undefined}>{fila[c.clave] ?? "—"}</td>)}</tr>)}</tbody>
              </table></div>
            )}
            {r.truncado && <p><strong>Se muestran solo las primeras 2000 filas. Acorte el rango de fechas.</strong></p>}
          </article>
        )}
      </main>
    </>
  );
}

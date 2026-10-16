import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { api, ErrorDeApi } from "../api/cliente";
import type { CatalogosFormulario, Municipio, Paciente } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Dialogo } from "../componentes/Dialogo";
import { Mensaje } from "../componentes/Mensaje";
import { Seleccion } from "../componentes/Seleccion";
import { TarjetaPaciente } from "../componentes/TarjetaPaciente";
import { nombreBreve, nombreCompleto } from "../texto";

interface Centro { id_departamento: number; id_municipio: number; zona: number }
const vacio = { nombres: "", apellidos: "", fecha_nacimiento: "", sexo: "", cui: "", sin_cui: false, telefono: "", direccion: "", zona: "", id_pueblo: "", id_comunidad_linguistica: "99", numero_registro_libro: "" };

// Solo para decidir si se muestra el apartado del encargado; el servidor valida la edad de verdad.
const esMenor = (fecha: string): boolean => {
  if (!fecha) return false;
  const n = new Date(`${fecha}T00:00:00`); const h = new Date();
  let a = h.getFullYear() - n.getFullYear();
  if (h.getMonth() < n.getMonth() || (h.getMonth() === n.getMonth() && h.getDate() < n.getDate())) a--;
  return a < 18;
};

export function FormularioPaciente() {
  const { id } = useParams();
  const editando = Boolean(id);
  const navegar = useNavigate();
  const [f, setF] = useState({ ...vacio });
  const [enc, setEnc] = useState({ nombres: "", apellidos: "", dpi: "", telefono: "", parentesco: "" });
  const [cat, setCat] = useState<CatalogosFormulario | null>(null);
  const [centro, setCentro] = useState<Centro | null>(null);
  const [idDep, setIdDep] = useState("");
  const [idMun, setIdMun] = useState("");
  const [municipios, setMunicipios] = useState<Municipio[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [errores, setErrores] = useState<Record<string, string>>({});
  const [avisos, setAvisos] = useState<string[]>([]);
  const [duplicados, setDuplicados] = useState<Paciente[] | null>(null);
  const [cargando, setCargando] = useState(false);
  const [original, setOriginal] = useState<Paciente | null>(null);
  const set = (k: string, v: string | boolean) => setF((a) => ({ ...a, [k]: v }));

  useEffect(() => {
    void (async () => {
      const [c, cen] = await Promise.all([api.get<CatalogosFormulario>("/api/catalogos/formulario"), api.get<Centro>("/api/configuracion/centro")]);
      setCat(c); setCentro(cen);
      if (id) {
        const p = await api.get<Paciente>(`/api/pacientes/${id}`);
        setOriginal(p);
        setF({ nombres: p.nombres ?? "", apellidos: p.apellidos ?? "", fecha_nacimiento: p.fecha_nacimiento ?? "", sexo: p.sexo, cui: p.cui ?? "", sin_cui: false,
          telefono: p.telefono ?? "", direccion: p.direccion ?? "", zona: p.zona_residencia ? String(p.zona_residencia) : "",
          id_pueblo: p.id_pueblo ? String(p.id_pueblo) : "", id_comunidad_linguistica: String(p.id_comunidad_linguistica), numero_registro_libro: p.numero_registro_libro ?? "" });
        if (p.id_municipio_residencia) {
          setIdMun(String(p.id_municipio_residencia));
          setIdDep(String(Math.floor(p.id_municipio_residencia / 100)));
        }
      } else {
        // El registro viene prellenado con Guatemala / Mixco / zona 10 (configuración del centro); todo se puede cambiar.
        setIdDep(String(cen.id_departamento)); setIdMun(String(cen.id_municipio)); set("zona", String(cen.zona));
      }
    })().catch((e) => setError(e instanceof Error ? e.message : "No se pudo cargar el formulario."));
  }, [id]);

  useEffect(() => {
    if (!idDep) { setMunicipios([]); return; }
    void api.get<{ datos: Municipio[] }>(`/api/catalogos/municipios?id_departamento=${idDep}`).then((r) => setMunicipios(r.datos)).catch(() => setMunicipios([]));
  }, [idDep]);

  const menor = useMemo(() => esMenor(f.fecha_nacimiento), [f.fecha_nacimiento]);

  const cuerpo = (confirmarDuplicado: boolean) => {
    const o: Record<string, unknown> = {
      nombres: f.nombres.trim(), apellidos: f.apellidos.trim(), fecha_nacimiento: f.fecha_nacimiento, sexo: f.sexo,
      telefono: f.telefono.trim() || null, direccion: f.direccion.trim() || null, id_municipio_residencia: idMun ? Number(idMun) : undefined,
      zona_residencia: f.zona ? Number(f.zona) : null,
      id_pueblo: f.id_pueblo ? Number(f.id_pueblo) : null, id_comunidad_linguistica: Number(f.id_comunidad_linguistica),
      numero_registro_libro: f.numero_registro_libro.trim() || null,
    };
    if (f.cui.trim()) o.cui = f.cui.trim();
    if (editando && confirmarDuplicado) o.confirmar_duplicado = true;
    if (!editando) {
      o.sin_cui = f.sin_cui; o.confirmar_duplicado = confirmarDuplicado;
      if (menor) o.encargado = { nombres: enc.nombres.trim(), apellidos: enc.apellidos.trim(), dpi: enc.dpi.trim() || null, telefono: enc.telefono.trim() || null, parentesco: enc.parentesco.trim() };
    }
    return o;
  };

  const guardar = async (confirmarDuplicado = false) => {
    setError(null); setErrores({}); setAvisos([]); setDuplicados(null);
    const faltan: Record<string, string> = {};
    if (!f.nombres.trim()) faltan.nombres = "Escriba los nombres.";
    if (!f.apellidos.trim()) faltan.apellidos = "Escriba los apellidos.";
    if (!f.fecha_nacimiento) faltan.fecha_nacimiento = "Indique la fecha de nacimiento.";
    if (!f.sexo) faltan.sexo = "Indique el sexo.";
    if (!editando && menor && (!enc.nombres.trim() || !enc.apellidos.trim() || !enc.parentesco.trim())) faltan.encargado = "Escriba el nombre, apellidos y parentesco del encargado.";
    if (!editando && !menor && !f.cui.trim() && !f.sin_cui) faltan.cui = "Escriba el DPI/CUI, o marque que no lo tiene.";
    if (Object.keys(faltan).length) { setErrores(faltan); setError("Revise los campos marcados."); return; }
    setCargando(true);
    try {
      const r = editando
        ? await api.patch<{ paciente: Paciente; advertencias: string[] }>(`/api/pacientes/${id}`, cuerpo(confirmarDuplicado))
        : await api.post<{ paciente: Paciente; advertencias: string[] }>("/api/pacientes", cuerpo(confirmarDuplicado));
      if (r.advertencias.length) { setAvisos(r.advertencias); }
      navegar("/recepcion", { state: { seleccionar: r.paciente.id_paciente, mensaje: editando ? "Datos guardados." : `Paciente registrado con el código ${r.paciente.codigo_paciente}.`, avisos: r.advertencias } });
    } catch (e) {
      if (e instanceof ErrorDeApi && e.info.codigo === "DUPLICADO_POSIBLE") setDuplicados(((e.info as unknown as { detalles: { duplicados: Paciente[] } }).detalles).duplicados);
      else if (e instanceof ErrorDeApi && e.info.codigo === "CUI_DUPLICADO") setError(`${e.info.mensaje} Búsquelo en recepción con ese número.`);
      else if (e instanceof ErrorDeApi && e.info.codigo === "DATOS_INVALIDOS" && e.info.detalles) {
        const m: Record<string, string> = {};
        for (const d of e.info.detalles) m[d.campo] = d.mensaje;
        setErrores(m); setError("Revise los campos marcados.");
      } else setError(e instanceof Error ? e.message : "No se pudo guardar.");
    } finally { setCargando(false); }
  };

  const enviar = (e: FormEvent) => { e.preventDefault(); void guardar(false); };

  return (
    <div className="app" data-area="recepcion">
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <div className="encabezado-pantalla">
          <h1>{editando ? `Editar datos de ${original ? nombreBreve(original) : "paciente"}` : "Nuevo paciente"}</h1>
          <Boton variante="secundario" onClick={() => navegar("/recepcion")}>Volver a recepción</Boton>
        </div>
        {error && <Mensaje tipo="error">{error}</Mensaje>}
        {avisos.map((a) => <Mensaje key={a} tipo="aviso">{a}</Mensaje>)}
        {editando && !original && !error && <p>Cargando los datos del paciente…</p>}
        {(!editando || original) && <form className="panel" onSubmit={enviar} noValidate>
          <div className="rejilla-formulario">
            <Campo etiqueta="Nombres" value={f.nombres} onChange={(e) => set("nombres", e.target.value)} error={errores.nombres} autoComplete="off" />
            <Campo etiqueta="Apellidos" value={f.apellidos} onChange={(e) => set("apellidos", e.target.value)} error={errores.apellidos} autoComplete="off" />
            <Campo etiqueta="Fecha de nacimiento" type="date" value={f.fecha_nacimiento} onChange={(e) => set("fecha_nacimiento", e.target.value)} error={errores.fecha_nacimiento} />
            <div className="campo">
              <span id="etiqueta-sexo" className="solo-lectores">Sexo</span>
              <label htmlFor="sexo-f">Sexo</label>
              <div className="opciones" role="radiogroup" aria-labelledby="etiqueta-sexo">
                <label className="opcion"><input id="sexo-f" type="radio" name="sexo" value="F" checked={f.sexo === "F"} onChange={() => set("sexo", "F")} />Mujer</label>
                <label className="opcion"><input type="radio" name="sexo" value="M" checked={f.sexo === "M"} onChange={() => set("sexo", "M")} />Hombre</label>
              </div>
              {errores.sexo && <div className="campo__error">{errores.sexo}</div>}
            </div>
            <Campo etiqueta="DPI/CUI" inputMode="numeric" value={f.cui} onChange={(e) => set("cui", e.target.value)} error={errores.cui} disabled={f.sin_cui}
              ayuda={menor ? "En menores de edad es opcional." : "13 dígitos, tal como aparece en el DPI."} autoComplete="off" />
            {!editando && !menor && (
              <div className="campo"><label className="casilla"><input type="checkbox" checked={f.sin_cui} onChange={(e) => { set("sin_cui", e.target.checked); if (e.target.checked) set("cui", ""); }} />La persona no tiene DPI</label></div>
            )}
            <Campo etiqueta="Teléfono" type="tel" inputMode="tel" value={f.telefono} onChange={(e) => set("telefono", e.target.value)} error={errores.telefono} autoComplete="off" />
            <Campo etiqueta="N.º de registro en libro (opcional)" value={f.numero_registro_libro} onChange={(e) => set("numero_registro_libro", e.target.value)} ayuda="Número de expediente del libro de papel, si lo tiene." autoComplete="off" />
          </div>

          <h2 className="subtitulo">Dónde vive</h2>
          <div className="rejilla-formulario">
            <Seleccion etiqueta="Departamento" value={idDep} onChange={(e) => { setIdDep(e.target.value); setIdMun(""); }} opciones={(cat?.departamentos ?? []).map((d) => ({ valor: d.id_departamento, texto: d.nombre_departamento }))} vacio="Elija" />
            <Seleccion etiqueta="Municipio" value={idMun} onChange={(e) => setIdMun(e.target.value)} opciones={municipios.map((m) => ({ valor: m.id_municipio, texto: m.nombre_municipio }))} vacio="Elija" />
            <Campo etiqueta="Zona" type="number" inputMode="numeric" min={1} value={f.zona} onChange={(e) => set("zona", e.target.value)} />
            <div className="ancho-completo"><Campo etiqueta="Dirección (calle, avenida y número)" value={f.direccion} onChange={(e) => set("direccion", e.target.value)} autoComplete="off" /></div>
          </div>

          <details className="mas-datos">
            <summary>Más datos (opcional)</summary>
            <div className="rejilla-formulario">
              <Seleccion etiqueta="Pueblo" value={f.id_pueblo} onChange={(e) => set("id_pueblo", e.target.value)} opciones={(cat?.pueblos ?? []).map((p) => ({ valor: p.id_pueblo, texto: p.nombre_pueblo }))} vacio="No indica" />
              <Seleccion etiqueta="Comunidad lingüística" value={f.id_comunidad_linguistica} onChange={(e) => set("id_comunidad_linguistica", e.target.value)} opciones={(cat?.comunidades_linguisticas ?? []).map((c) => ({ valor: c.id_comunidad_linguistica, texto: c.nombre_comunidad_linguistica }))} />
            </div>
          </details>

          {!editando && menor && (
            <>
              <h2 className="subtitulo">Encargado del menor</h2>
              {errores.encargado && <Mensaje tipo="error">{errores.encargado}</Mensaje>}
              <div className="rejilla-formulario">
                <Campo etiqueta="Nombres del encargado" error={errores["encargado.nombres"]} value={enc.nombres} onChange={(e) => setEnc({ ...enc, nombres: e.target.value })} autoComplete="off" />
                <Campo etiqueta="Apellidos del encargado" error={errores["encargado.apellidos"]} value={enc.apellidos} onChange={(e) => setEnc({ ...enc, apellidos: e.target.value })} autoComplete="off" />
                <Campo etiqueta="Parentesco" error={errores["encargado.parentesco"]} value={enc.parentesco} onChange={(e) => setEnc({ ...enc, parentesco: e.target.value })} ayuda="Madre, padre, abuela, tío, tutor…" autoComplete="off" />
                <Campo etiqueta="DPI del encargado (opcional)" error={errores["encargado.dpi"]} inputMode="numeric" value={enc.dpi} onChange={(e) => setEnc({ ...enc, dpi: e.target.value })} autoComplete="off" />
                <Campo etiqueta="Teléfono del encargado (opcional)" error={errores["encargado.telefono"]} type="tel" value={enc.telefono} onChange={(e) => setEnc({ ...enc, telefono: e.target.value })} autoComplete="off" />
              </div>
            </>
          )}
          <div className="acciones"><Boton type="submit" cargando={cargando}>{editando ? "Guardar cambios" : "Registrar paciente"}</Boton><Boton variante="secundario" onClick={() => navegar("/recepcion")}>Cancelar</Boton></div>
        </form>}
      </main>
      {duplicados && (
        <Dialogo titulo="Ya existe alguien parecido" textoConfirmar="Es otra persona, registrar" textoCancelar="Revisar" alConfirmar={() => void guardar(true)} alCancelar={() => setDuplicados(null)}>
          <p>Hay un paciente con nombre parecido y la misma fecha de nacimiento. Revise antes de registrar otro:</p>
          {duplicados.map((d) => <TarjetaPaciente key={d.id_paciente} paciente={{ ...d, edad: d.edad?.texto, estado: d.atencion_abierta?.estado }} />)}
          <p>¿Registrar a {nombreCompleto(f)} como una persona distinta?</p>
        </Dialogo>
      )}
    </div>
  );
}

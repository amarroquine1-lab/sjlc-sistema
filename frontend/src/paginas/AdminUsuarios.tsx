import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api/cliente";
import type { UsuarioFila } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Dialogo } from "../componentes/Dialogo";
import { Mensaje } from "../componentes/Mensaje";
import { Seleccion } from "../componentes/Seleccion";
import { Tabla } from "../componentes/Tabla";
import { capitalizar } from "../texto";

type Accion = { tipo: "desactivar" | "activar" | "restablecer-contrasena" | "desbloquear"; u: UsuarioFila };
const VERBO: Record<Accion["tipo"], string> = { desactivar: "Desactivar", activar: "Activar", "restablecer-contrasena": "Restablecer la contraseña de", desbloquear: "Desbloquear" };

// Usuarios: crear, desactivar, restablecer contraseñas y desbloquear. La contraseña temporal se muestra una sola vez.
export function AdminUsuarios() {
  const [roles, setRoles] = useState<{ id_rol: number; nombre_rol: string }[]>([]);
  const [lista, setLista] = useState<UsuarioFila[]>([]);
  const [q, setQ] = useState("");
  const [nuevo, setNuevo] = useState({ nombres: "", apellidos: "", id_rol: "" });
  const [mensaje, setMensaje] = useState<{ tipo: "exito" | "error" | "aviso"; texto: string } | null>(null);
  const [temporal, setTemporal] = useState<{ usuario: string; clave: string } | null>(null);
  const [accion, setAccion] = useState<Accion | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mostrarEliminados, setMostrarEliminados] = useState(false);
  const [eliminando, setEliminando] = useState<UsuarioFila | null>(null);
  const [escrito, setEscrito] = useState("");

  // La contraseña temporal no queda en pantalla: se oculta sola a los 2 minutos o al salir de la pestaña.
  useEffect(() => {
    if (!temporal) return;
    const t = window.setTimeout(() => setTemporal(null), 120000);
    const alCambiar = () => { if (document.visibilityState === "hidden") setTemporal(null); };
    document.addEventListener("visibilitychange", alCambiar);
    return () => { window.clearTimeout(t); document.removeEventListener("visibilitychange", alCambiar); };
  }, [temporal]);

  const cargar = useCallback(async () => {
    try { setLista((await api.get<{ datos: UsuarioFila[] }>(`/api/usuarios?por_pagina=100${q.trim() ? `&q=${encodeURIComponent(q.trim())}` : ""}${mostrarEliminados ? "&incluir_eliminados=true" : ""}`)).datos); }
    catch (e) { setMensaje({ tipo: "error", texto: e instanceof Error ? e.message : "No se pudo cargar la lista." }); }
  }, [q, mostrarEliminados]);
  useEffect(() => { api.get<{ datos: { id_rol: number; nombre_rol: string }[] }>("/api/roles").then((r) => setRoles(r.datos)).catch(() => undefined); }, []);
  useEffect(() => { void cargar(); }, [cargar]);

  const crear = async (e: FormEvent) => {
    e.preventDefault(); setMensaje(null); setTemporal(null);
    if (!nuevo.nombres.trim() || !nuevo.apellidos.trim() || !nuevo.id_rol) { setMensaje({ tipo: "error", texto: "Escriba nombres, apellidos y elija el rol." }); return; }
    setCargando(true);
    try {
      const r = await api.post<{ usuario: UsuarioFila; contrasena_temporal: string }>("/api/usuarios", { nombres: nuevo.nombres.trim(), apellidos: nuevo.apellidos.trim(), id_rol: Number(nuevo.id_rol) });
      setTemporal({ usuario: r.usuario.nombre_usuario, clave: r.contrasena_temporal });
      setMensaje({ tipo: "exito", texto: `Usuario ${r.usuario.nombre_usuario} creado.` });
      setNuevo({ nombres: "", apellidos: "", id_rol: "" }); await cargar();
    } catch (err) { setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "No se pudo crear el usuario." }); }
    finally { setCargando(false); }
  };

  const confirmar = async () => {
    if (!accion) return;
    setCargando(true); setTemporal(null);
    try {
      const r = await api.post<{ contrasena_temporal?: string }>(`/api/usuarios/${accion.u.id_usuario}/${accion.tipo}`);
      if (r.contrasena_temporal) setTemporal({ usuario: accion.u.nombre_usuario, clave: r.contrasena_temporal });
      setMensaje({ tipo: "exito", texto: `Listo: ${accion.u.nombre_usuario}.` }); await cargar();
    } catch (err) { setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "No se pudo completar la acción." }); }
    finally { setCargando(false); setAccion(null); }
  };

  // Eliminar sirve para cualquier cuenta, salvo la propia y el último administrador activo; entonces el botón queda apagado y al tocarlo explica por qué.
  const eliminar = async () => {
    if (!eliminando) return;
    setCargando(true); setTemporal(null);
    try {
      await api.post(`/api/usuarios/${eliminando.id_usuario}/eliminar`, { confirmacion: escrito.trim() });
      setMensaje({ tipo: "exito", texto: eliminando.modo_eliminacion === "borrar"
        ? `Usuario ${eliminando.nombre_usuario} borrado por completo.` : `Usuario ${eliminando.nombre_usuario} quitado del sistema; sus registros se conservan.` });
      await cargar();
    } catch (err) { setMensaje({ tipo: "error", texto: err instanceof Error ? err.message : "No se pudo eliminar el usuario." }); await cargar(); }
    finally { setCargando(false); setEliminando(null); setEscrito(""); }
  };
  const btnEliminar = (u: UsuarioFila) => (
    <Boton variante="secundario" className="boton--pequeno" aria-label={`Eliminar ${u.nombre_usuario}`} aria-disabled={!u.puede_eliminar || undefined} title={u.motivo_no_eliminar ?? undefined}
      onClick={() => { if (u.puede_eliminar) { setMensaje(null); setEscrito(""); setEliminando(u); } else setMensaje({ tipo: "aviso", texto: `${u.nombre_usuario}: ${u.motivo_no_eliminar ?? "no se puede eliminar."}` }); }}>Eliminar</Boton>
  );
  const btn = (tipo: Accion["tipo"], u: UsuarioFila, texto: string, corto: string) => <Boton variante="secundario" className="boton--pequeno" aria-label={`${texto} ${u.nombre_usuario}`} onClick={() => setAccion({ tipo, u })}>{corto}</Boton>;

  return (
    <>
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <h1>Usuarios</h1>
        {mensaje && <Mensaje tipo={mensaje.tipo}>{mensaje.texto}</Mensaje>}
        {temporal && <Mensaje tipo="aviso">Contraseña temporal de <strong>{temporal.usuario}</strong>: <strong className="cifras">{temporal.clave}</strong>. Anótela y entréguela en persona; no se vuelve a mostrar y deberá cambiarla al ingresar. <Boton variante="secundario" onClick={() => setTemporal(null)}>Ya la anoté</Boton></Mensaje>}
        <form onSubmit={crear} aria-label="Crear usuario" noValidate className="formulario-compacto">
          <h2>Crear usuario</h2>
          <>
            <Campo etiqueta="Nombres" value={nuevo.nombres} onChange={(e) => setNuevo({ ...nuevo, nombres: e.target.value })} maxLength={100} autoComplete="off" />
            <Campo etiqueta="Apellidos" value={nuevo.apellidos} onChange={(e) => setNuevo({ ...nuevo, apellidos: e.target.value })} maxLength={100} autoComplete="off" />
            <Seleccion etiqueta="Rol" value={nuevo.id_rol} vacio="Elija un rol" onChange={(e) => setNuevo({ ...nuevo, id_rol: e.target.value })} opciones={roles.map((r) => ({ valor: r.id_rol, texto: capitalizar(r.nombre_rol) }))} ayuda="El usuario se genera solo (inicial + apellido)." />
          </>
          <Boton type="submit" cargando={cargando && !accion}>Crear usuario</Boton>
        </form>
        <div className="seccion-pagina"><h2>Cuentas</h2></div>
        <Campo etiqueta="Buscar por nombre o usuario" value={q} onChange={(e) => setQ(e.target.value)} autoComplete="off" />
        <label className="casilla"><input type="checkbox" checked={mostrarEliminados} onChange={(e) => setMostrarEliminados(e.target.checked)} />Mostrar eliminados (solo consulta)</label>
        <Tabla clave={(u) => u.id_usuario} filas={lista} columnas={[
          { titulo: "Usuario", celda: (u) => <strong>{u.nombre_usuario}</strong> },
          { titulo: "Nombre", celda: (u) => `${u.nombres} ${u.apellidos}` },
          { titulo: "Rol", celda: (u) => capitalizar(u.rol) },
          { titulo: "Estado", celda: (u) => u.eliminado_el ? `Eliminado el ${new Date(u.eliminado_el).toLocaleDateString("es-GT")}` : [u.activo ? "Activo" : "Desactivado", u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() ? "bloqueado" : null, u.debe_cambiar_contrasena ? "debe cambiar contraseña" : null].filter(Boolean).join(" · ") },
          { titulo: "Acciones", celda: (u) => u.eliminado_el ? <span className="texto-suave">Solo consulta</span> : <div className="acciones-fila">{u.activo ? btn("desactivar", u, "Desactivar", "Desactivar") : btn("activar", u, "Activar", "Activar")}{btn("restablecer-contrasena", u, "Restablecer contraseña de", "Restablecer contraseña")}{u.bloqueado_hasta && new Date(u.bloqueado_hasta) > new Date() && btn("desbloquear", u, "Desbloquear", "Desbloquear")}{btnEliminar(u)}</div> },
        ]} />
      </main>
      {eliminando && (
        <Dialogo titulo="Eliminar usuario" textoConfirmar="Eliminar" peligro cargando={cargando} confirmarDeshabilitado={escrito.trim() !== eliminando.nombre_usuario}
          alConfirmar={() => void eliminar()} alCancelar={() => { setEliminando(null); setEscrito(""); }}>
          {eliminando.modo_eliminacion === "borrar"
            ? <p>Se borrará por completo la cuenta de {eliminando.nombres} {eliminando.apellidos} ({eliminando.nombre_usuario}). No tiene registros; la acción no se puede deshacer y queda anotada en la bitácora.</p>
            : <p>Se quitará del sistema a {eliminando.nombres} {eliminando.apellidos} ({eliminando.nombre_usuario}), sus registros se conservan. Desaparece de la lista, no podrá volver a entrar ni se podrá reactivar, y su nombre seguirá apareciendo en las atenciones, recetas y demás registros. Queda anotado en la bitácora.</p>}
          <Campo etiqueta={`Escriba ${eliminando.nombre_usuario} para confirmar`} value={escrito} onChange={(e) => setEscrito(e.target.value)} autoComplete="off" autoCapitalize="none" spellCheck={false} />
        </Dialogo>
      )}
      {accion && (
        <Dialogo titulo="Confirmar" textoConfirmar={VERBO[accion.tipo].startsWith("Restablecer") ? "Restablecer" : VERBO[accion.tipo]} peligro={accion.tipo === "desactivar"} cargando={cargando} alConfirmar={() => void confirmar()} alCancelar={() => setAccion(null)}>
          <p>¿{VERBO[accion.tipo]} {accion.u.nombres} {accion.u.apellidos} ({accion.u.nombre_usuario})?{accion.tipo === "desactivar" ? " Se cerrarán sus sesiones." : ""}</p>
        </Dialogo>
      )}
    </>
  );
}

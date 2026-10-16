import { type FormEvent, useCallback, useEffect, useState } from "react";
import { api } from "../api/cliente";
import type { FilaBitacora } from "../api/tipos";
import { AvisoVencimiento } from "../componentes/AvisoVencimiento";
import { BarraSuperior } from "../componentes/BarraSuperior";
import { Boton } from "../componentes/Boton";
import { Campo } from "../componentes/Campo";
import { Mensaje } from "../componentes/Mensaje";
import { Seleccion } from "../componentes/Seleccion";
import { Tabla } from "../componentes/Tabla";

const POR_PAGINA = 50;

// Bitácora de auditoría: quién, qué, cuándo y desde dónde. Solo administradores.
export function AdminBitacora() {
  const [opciones, setOpciones] = useState<{ acciones: string[]; entidades: string[] }>({ acciones: [], entidades: [] });
  const [f, setF] = useState({ usuario: "", accion: "", entidad: "", desde: "", hasta: "" });
  const [aplicado, setAplicado] = useState(f);
  const [pagina, setPagina] = useState(1);
  const [datos, setDatos] = useState<{ datos: FilaBitacora[]; total: number } | null>(null);
  const [detalle, setDetalle] = useState<{ id: number; anterior: unknown; nuevo: unknown } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { api.get<{ acciones: string[]; entidades: string[] }>("/api/bitacora/opciones").then(setOpciones).catch(() => undefined); }, []);
  const cargar = useCallback(async () => {
    const q = new URLSearchParams({ pagina: String(pagina), por_pagina: String(POR_PAGINA) });
    for (const [k, v] of Object.entries(aplicado)) if (v) q.set(k, v);
    try { setDatos(await api.get(`/api/bitacora?${q}`)); setError(null); } catch (e) { setError(e instanceof Error ? e.message : "No se pudo cargar la bitácora."); }
  }, [aplicado, pagina]);
  useEffect(() => { void cargar(); }, [cargar]);

  const filtrar = (e: FormEvent) => { e.preventDefault(); setPagina(1); setAplicado(f); };
  const ver = async (id: number) => {
    try { const d = await api.get<{ valor_anterior: unknown; valor_nuevo: unknown }>(`/api/bitacora/${id}`); setDetalle({ id, anterior: d.valor_anterior, nuevo: d.valor_nuevo }); }
    catch (e) { setError(e instanceof Error ? e.message : "No se pudo abrir el registro."); }
  };

  return (
    <>
      <BarraSuperior /><AvisoVencimiento />
      <main id="contenido" tabIndex={-1} className="pagina">
        <h1>Bitácora</h1>
        <form onSubmit={filtrar} aria-label="Filtros de la bitácora" noValidate>
          <div className="filtros">
            <Campo etiqueta="Usuario" value={f.usuario} onChange={(e) => setF({ ...f, usuario: e.target.value })} autoComplete="off" />
            <Seleccion etiqueta="Acción" value={f.accion} vacio="Todas" onChange={(e) => setF({ ...f, accion: e.target.value })} opciones={opciones.acciones.map((a) => ({ valor: a, texto: a }))} />
            <Seleccion etiqueta="Tabla" value={f.entidad} vacio="Todas" onChange={(e) => setF({ ...f, entidad: e.target.value })} opciones={opciones.entidades.map((a) => ({ valor: a, texto: a }))} />
            <Campo etiqueta="Desde" type="date" value={f.desde} onChange={(e) => setF({ ...f, desde: e.target.value })} />
            <Campo etiqueta="Hasta" type="date" value={f.hasta} onChange={(e) => setF({ ...f, hasta: e.target.value })} />
            <Boton type="submit" className="filtros__boton">Filtrar</Boton>
          </div>
        </form>
        {error && <Mensaje tipo="error">{error}</Mensaje>}
        {datos && <>
          <p>{datos.total} registros.</p>
          <Tabla clave={(r) => r.id_bitacora} filas={datos.datos} vacio="No hay registros con esos filtros." columnas={[
            { titulo: "Fecha y hora", celda: (r) => r.fecha_hora }, { titulo: "Usuario", celda: (r) => r.usuario ?? "—" }, { titulo: "Acción", celda: (r) => r.accion },
            { titulo: "Tabla", celda: (r) => `${r.entidad}${r.id_registro ? ` #${r.id_registro}` : ""}` }, { titulo: "IP", celda: (r) => r.direccion_ip ?? "—" }, { titulo: "Detalle", celda: (r) => r.detalle ?? "" },
            { titulo: "Cambio", celda: (r) => <Boton variante="secundario" className="boton--pequeno" aria-label={`Ver cambio ${r.id_bitacora}`} onClick={() => void ver(r.id_bitacora)}>Ver cambio</Boton> },
          ]} />
          <div className="acciones">
            <Boton variante="secundario" disabled={pagina <= 1} onClick={() => setPagina((p) => p - 1)}>Anterior</Boton>
            <Boton variante="secundario" disabled={pagina * POR_PAGINA >= datos.total} onClick={() => setPagina((p) => p + 1)}>Siguiente</Boton>
          </div>
        </>}
        {detalle && (
          <section className="panel" aria-label="Detalle del cambio">
            <h2>Cambio del registro {detalle.id}</h2>
            <h3>Antes</h3><pre className="json">{detalle.anterior ? JSON.stringify(detalle.anterior, null, 2) : "—"}</pre>
            <h3>Después</h3><pre className="json">{detalle.nuevo ? JSON.stringify(detalle.nuevo, null, 2) : "—"}</pre>
            <Boton variante="secundario" onClick={() => setDetalle(null)}>Cerrar</Boton>
          </section>
        )}
      </main>
    </>
  );
}

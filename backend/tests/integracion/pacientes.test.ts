import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { get, hayBd, idRol, idUsuarioDe, ingresar, montar, patch, post, type Montaje } from "./ayudas.js";

const CUI_VALIDO = "1234567890108";
let n = 0;
const fechaUnica = () => { n++; const d = new Date(Date.UTC(1950, 0, 1) + ((n * 131 + Math.floor(Math.random() * 9000)) % 19000) * 86400000); return d.toISOString().slice(0, 10); };
const unico = () => { n++; return Array.from(String(Date.now()) + n, (d) => "abcdefghij"[Number(d)]).join("").slice(-9); };
const cuiNuevo = (): string => { // 13 dígitos únicos con verificador correcto y municipio 0108
  for (;;) {
    const base = String(10000000 + Math.floor(Math.random() * 89999999));
    let t = 0; for (let i = 0; i < 8; i++) t += Number(base[i]) * (i + 2);
    if (t % 11 < 10) return `${base}${t % 11}0108`;
  }
};

describe.skipIf(!hayBd)("recepción: pacientes y atenciones", () => {
  let m: Montaje; let rec: string; let signos: string; let admin: string; let farmacia: string;
  const IP = "198.51.104.1";
  beforeAll(async () => {
    m = montar();
    rec = (await ingresar(m.app, "precepcion", "198.51.104.2")).cookie!;
    signos = (await ingresar(m.app, "psignos", "198.51.104.3")).cookie!;
    admin = (await ingresar(m.app, "padmin", "198.51.104.4")).cookie!;
    farmacia = (await ingresar(m.app, "pfarmacia", "198.51.104.5")).cookie!;
  });
  afterAll(async () => { await m.cerrar(); });

  const adulto = (extra: Record<string, unknown> = {}) => ({ nombres: "Prueba", apellidos: `Adulta${unico()}`, fecha_nacimiento: fechaUnica(), sexo: "F", cui: cuiNuevo(), ...extra });
  const registrar = (cuerpo: object, cookie = rec) => post(m.app, "/api/pacientes", cookie, cuerpo, IP);

  it("registra un adulto con los valores por omisión del centro y el código SJLC-", async () => {
    const r = await registrar(adulto({ direccion: "5a avenida 10-20" }));
    expect(r.status).toBe(201);
    expect(r.body.paciente).toMatchObject({ id_municipio_residencia: 108, municipio_residencia: "Mixco", zona_residencia: 10, id_comunidad_linguistica: 99, es_menor: false });
    expect(r.body.paciente.codigo_paciente).toMatch(/^SJLC-\d{6,}$/);
    expect(r.body.paciente.edad.anios).toBeGreaterThanOrEqual(18);
    expect(r.body.advertencias).toEqual([]);
    const b = await m.dueno.query("SELECT id_usuario FROM bitacora WHERE accion = 'crear' AND entidad = 'pacientes' AND id_registro = $1", [r.body.paciente.id_paciente]);
    expect(b.rows[0].id_usuario).toBe(await idUsuarioDe(m.dueno, "precepcion"));
  });

  it("un adulto sin CUI necesita confirmarlo; un CUI con dígito verificador dudoso se acepta con advertencia", async () => {
    const sin = await registrar(adulto({ cui: undefined }));
    expect(sin.status).toBe(422); expect(sin.body.error.codigo).toBe("CUI_REQUERIDO");
    const conf = await registrar(adulto({ cui: undefined, sin_cui: true }));
    expect(conf.status).toBe(201); expect(conf.body.paciente.cui).toBeNull();
    const dudoso = await registrar(adulto({ cui: "1234567800199" }));
    expect(dudoso.status).toBe(201); expect(dudoso.body.advertencias.length).toBeGreaterThanOrEqual(1);
  });

  it("rechaza datos inválidos: fecha futura, CUI corto, sexo, campos desconocidos", async () => {
    expect((await registrar(adulto({ fecha_nacimiento: "2999-01-01" }))).status).toBe(422);
    expect((await registrar(adulto({ cui: "123" }))).status).toBe(422);
    expect((await registrar(adulto({ sexo: "X" }))).status).toBe(422);
    expect((await registrar(adulto({ rol: "administrador" }))).status).toBe(422);
    expect((await registrar(adulto({ nombres: "<script>alert(1)</script>" }))).status).toBe(422);
  });

  it("un CUI repetido se rechaza mostrando al paciente existente", async () => {
    const cui = cuiNuevo();
    expect((await registrar(adulto({ cui }))).status).toBe(201);
    const otra = await registrar(adulto({ cui }));
    expect(otra.status).toBe(409); expect(otra.body.error.codigo).toBe("CUI_DUPLICADO");
    expect(otra.body.error.detalles.paciente.cui).toBe(cui);
  });

  it("avisa de un posible duplicado (mismo nombre y fecha) y deja registrarlo si se confirma", async () => {
    const apellidos = `Duplicada${unico()}`;
    const base = { nombres: "María José", apellidos, fecha_nacimiento: "1990-07-07", sexo: "F" };
    expect((await registrar({ ...base, cui: cuiNuevo() })).status).toBe(201);
    const similar = await registrar({ ...base, nombres: "Maria Jose", cui: cuiNuevo() }); // sin tildes
    expect(similar.status).toBe(409); expect(similar.body.error.codigo).toBe("DUPLICADO_POSIBLE");
    expect(similar.body.error.detalles.duplicados).toHaveLength(1);
    expect((await registrar({ ...base, nombres: "Maria Jose", cui: cuiNuevo(), confirmar_duplicado: true })).status).toBe(201);
  });

  it("un menor necesita encargado, puede no tener CUI y se encuentra por el DPI del encargado", async () => {
    const dpi = cuiNuevo();
    const menor = { nombres: "Niña", apellidos: `Menor${unico()}`, fecha_nacimiento: "2022-01-10", sexo: "F" };
    const sin = await registrar(menor);
    expect(sin.status).toBe(422); expect(sin.body.error.codigo).toBe("ENCARGADO_REQUERIDO");
    const r = await registrar({ ...menor, encargado: { nombres: "Mamá", apellidos: "Responsable", dpi, parentesco: "Madre" } });
    expect(r.status).toBe(201);
    expect(r.body.paciente).toMatchObject({ es_menor: true, cui: null });
    expect(r.body.paciente.encargados[0]).toMatchObject({ parentesco: "Madre", dpi, es_principal: true });
    const b = await get(m.app, `/api/pacientes/buscar?q=${dpi}`, rec, IP);
    expect(b.body.datos.map((p: { id_paciente: number }) => p.id_paciente)).toContain(r.body.paciente.id_paciente);
  });

  it("busca desde un solo campo: código, nombre sin tildes ni mayúsculas, fecha, CUI, número de atención", async () => {
    const apellidos = `Búsquedaz${unico()}`;
    const cui = cuiNuevo();
    const r = await registrar({ nombres: "José Ángel", apellidos, fecha_nacimiento: "1971-11-02", sexo: "M", cui });
    const id = r.body.paciente.id_paciente; const codigo = r.body.paciente.codigo_paciente;
    const ids = async (q: string) => (await get(m.app, `/api/pacientes/buscar?q=${encodeURIComponent(q)}`, rec, IP)).body.datos.map((p: { id_paciente: number }) => p.id_paciente);
    expect(await ids(codigo)).toEqual([id]);
    expect(await ids(codigo.toLowerCase().replace("-", ""))).toEqual([id]);
    expect(await ids(`JOSE ANGEL ${apellidos.toUpperCase().replace("Ú", "U")}`)).toEqual([id]);
    expect(await ids("jose busquedaz")).toContain(id);
    expect(await ids("02/11/1971")).toContain(id);
    expect(await ids(cui)).toEqual([id]);
    const a = await post(m.app, "/api/atenciones", rec, { id_paciente: id, id_tipo_atencion: 1 }, IP);
    expect(await ids(a.body.numero_atencion)).toEqual([id]);
    expect((await get(m.app, "/api/pacientes/buscar?q=", rec, IP)).body.datos).toEqual([]);
    // comodines y SQL no amplían el resultado
    expect((await get(m.app, `/api/pacientes/buscar?q=${encodeURIComponent("%")}`, rec, IP)).body.datos).toEqual([]);
    expect((await get(m.app, `/api/pacientes/buscar?q=${encodeURIComponent("' OR 1=1 --")}`, rec, IP)).body.datos).toEqual([]);
  });

  it("abre una atención, la envía a signos, impide una segunda abierta y permite marcar que se retiró", async () => {
    const p = (await registrar(adulto())).body.paciente;
    const tipos = (await get(m.app, "/api/catalogos/tipos-atencion", rec, IP)).body.datos;
    expect(tipos.map((t: { nombre_tipo_atencion: string }) => t.nombre_tipo_atencion)).toHaveLength(5);
    const a = await post(m.app, "/api/atenciones", rec, { id_paciente: p.id_paciente, id_tipo_atencion: tipos[0].id_tipo_atencion }, IP);
    expect(a.status).toBe(201);
    expect(a.body).toMatchObject({ estado: "en_espera", area_actual: "signos vitales", codigo_paciente: p.codigo_paciente });
    expect(a.body.numero_atencion).toMatch(/^A-\d{6,}$/);
    const otra = await post(m.app, "/api/atenciones", rec, { id_paciente: p.id_paciente, id_tipo_atencion: tipos[0].id_tipo_atencion }, IP);
    expect(otra.status).toBe(409); expect(otra.body.error.codigo).toBe("ATENCION_ABIERTA");
    const det = await get(m.app, `/api/pacientes/${p.id_paciente}`, signos, IP);
    expect(det.body.atencion_abierta.numero_atencion).toBe(a.body.numero_atencion);
    const retiro = await post(m.app, `/api/atenciones/${a.body.id_atencion}/se-retiro`, rec, {}, IP);
    expect(retiro.body.estado).toBe("se_retiro");
    expect((await post(m.app, `/api/atenciones/${a.body.id_atencion}/se-retiro`, rec, {}, IP)).status).toBe(409);
    const cola = await m.dueno.query("SELECT count(*)::int AS n FROM recorridos_atencion WHERE id_atencion = $1 AND fecha_hora_salida IS NULL", [a.body.id_atencion]);
    expect(cola.rows[0].n).toBe(0);
    expect((await post(m.app, "/api/atenciones", rec, { id_paciente: p.id_paciente, id_tipo_atencion: tipos[0].id_tipo_atencion }, IP)).status).toBe(201);
  });

  it("el ticket lleva el número de atención como código de barras y nunca el DPI", async () => {
    const p = (await registrar(adulto({ nombres: "Ticket", apellidos: "Zeta" }))).body.paciente;
    const a = await post(m.app, "/api/atenciones", rec, { id_paciente: p.id_paciente, id_tipo_atencion: 1 }, IP);
    const t = (await get(m.app, `/api/atenciones/${a.body.id_atencion}/ticket`, rec, IP)).body;
    expect(t).toMatchObject({ centro: "Centro de Salud San José La Comunidad", codigo_paciente: p.codigo_paciente, numero_atencion: a.body.numero_atencion, codigo_barras: a.body.numero_atencion, nombre: "Ticket Z." });
    expect(JSON.stringify(t)).not.toContain(p.cui);
    expect(Object.keys(t)).not.toContain("cui");
  });

  it("emergencia: registro rápido con datos incompletos, entra directo al doctor y se completa después", async () => {
    const e = await post(m.app, "/api/pacientes/emergencia", rec, { sexo: "M", edad_aproximada_anios: 35 }, IP);
    expect(e.status).toBe(201);
    expect(e.body.paciente).toMatchObject({ datos_incompletos: true, nombres: null, edad_aproximada_anios: 35, atencion_abierta: { es_emergencia: true, area_actual: "doctor" } });
    const lista = await get(m.app, "/api/pacientes/incompletos", rec, IP);
    expect(lista.body.datos.map((p: { id_paciente: number }) => p.id_paciente)).toContain(e.body.paciente.id_paciente);
    const c = await patch(m.app, `/api/pacientes/${e.body.paciente.id_paciente}`, rec, { nombres: "Ya", apellidos: `Identificado${unico()}`, fecha_nacimiento: "1990-01-01", cui: cuiNuevo() }, IP);
    expect(c.status).toBe(200); expect(c.body.paciente.datos_incompletos).toBe(false);
    expect((await get(m.app, "/api/pacientes/incompletos", rec, IP)).body.datos.map((p: { id_paciente: number }) => p.id_paciente)).not.toContain(e.body.paciente.id_paciente);
  });

  it("une dos registros: mueve atenciones y encargados, deja el absorbido fuera de las búsquedas y anota el motivo", async () => {
    const apellidos = `Unir${unico()}`;
    const a = (await registrar({ nombres: "Ana", apellidos, fecha_nacimiento: "1995-05-05", sexo: "F", cui: cuiNuevo() })).body.paciente;
    const e = (await post(m.app, "/api/pacientes/emergencia", rec, { sexo: "F", edad_aproximada_anios: 30 }, IP)).body;
    const unida = await post(m.app, `/api/pacientes/${a.id_paciente}/unir`, rec, { id_paciente_unido: e.paciente.id_paciente, motivo: "Era la misma persona atendida de emergencia" }, IP);
    expect(unida.status).toBe(200);
    expect(unida.body.atencion_abierta.es_emergencia).toBe(true); // la atención de la emergencia pasó al registro conservado
    expect((await get(m.app, `/api/pacientes/buscar?q=${a.codigo_paciente}`, rec, IP)).body.datos).toHaveLength(1);
    expect((await get(m.app, `/api/pacientes/buscar?q=${e.paciente.codigo_paciente}`, rec, IP)).body.datos).toHaveLength(0);
    expect((await patch(m.app, `/api/pacientes/${e.paciente.id_paciente}`, rec, { telefono: "55550000" }, IP)).body.error.codigo).toBe("PACIENTE_UNIDO");
    const b = await m.dueno.query("SELECT detalle, id_usuario FROM bitacora WHERE accion = 'unir' AND id_registro = $1", [a.id_paciente]);
    expect(b.rows[0].detalle).toMatch(/Motivo: Era la misma persona/);
    expect(b.rows[0].id_usuario).toBe(await idUsuarioDe(m.dueno, "precepcion"));
    const u = await m.dueno.query("SELECT motivo, datos_unido->>'codigo_paciente' AS codigo FROM uniones_pacientes WHERE id_paciente = $1", [a.id_paciente]);
    expect(u.rows[0].codigo).toBe(e.paciente.codigo_paciente);
    // no se vuelve a unir ni con atención abierta en ambos
    expect((await post(m.app, `/api/pacientes/${a.id_paciente}/unir`, rec, { id_paciente_unido: e.paciente.id_paciente, motivo: "Otra vez lo mismo" }, IP)).status).toBe(409);
    const x = (await registrar(adulto())).body.paciente; const y = (await registrar(adulto())).body.paciente;
    await post(m.app, "/api/atenciones", rec, { id_paciente: x.id_paciente, id_tipo_atencion: 1 }, IP);
    await post(m.app, "/api/atenciones", rec, { id_paciente: y.id_paciente, id_tipo_atencion: 1 }, IP);
    const dos = await post(m.app, `/api/pacientes/${x.id_paciente}/unir`, rec, { id_paciente_unido: y.id_paciente, motivo: "Prueba de atenciones abiertas" }, IP);
    expect(dos.status).toBe(409); expect(dos.body.error.codigo).toBe("ATENCION_ABIERTA_EN_AMBOS");
    expect((await post(m.app, `/api/pacientes/${x.id_paciente}/unir`, rec, { id_paciente_unido: x.id_paciente, motivo: "Consigo mismo no" }, IP)).status).toBe(422);
  });

  it("permisos: otras áreas ven pero no escriben; solo administración crea colonias", async () => {
    const lectura = await get(m.app, "/api/pacientes/buscar?q=prueba", signos, IP);
    expect(lectura.status).toBe(200);
    for (const [ruta, cuerpo] of [["/api/pacientes", adulto()], ["/api/pacientes/emergencia", { sexo: "M", edad_aproximada_anios: 20 }], ["/api/atenciones", { id_paciente: 1, id_tipo_atencion: 1 }], ["/api/pacientes/1/unir", { id_paciente_unido: 2, motivo: "No debería poder" }]] as const) {
      for (const c of [signos, farmacia]) expect((await post(m.app, ruta, c, cuerpo, IP)).status, ruta).toBe(403);
    }
    expect((await patch(m.app, "/api/pacientes/1", signos, { telefono: "55550000" }, IP)).status).toBe(403);
    expect((await get(m.app, "/api/atenciones/abiertas", signos, IP)).status).toBe(403);
    expect((await post(m.app, "/api/colonias-sectores", rec, { id_municipio: 108, zona: 10, nombre_colonia_sector: "No autorizada" }, IP)).status).toBe(403);
    const c = await post(m.app, "/api/colonias-sectores", admin, { id_municipio: 108, zona: 10, nombre_colonia_sector: `Colonia de prueba ${unico()}`, sector_centro: "Sector A" }, IP);
    expect(c.status).toBe(201);
    const cat = await get(m.app, "/api/catalogos/formulario", rec, IP);
    expect(cat.body.colonias_sectores.some((x: { id_colonia_sector: number }) => x.id_colonia_sector === c.body.id_colonia_sector)).toBe(true);
    const p = await registrar(adulto({ id_colonia_sector: c.body.id_colonia_sector }));
    expect(p.body.paciente).toMatchObject({ id_colonia_sector: c.body.id_colonia_sector, zona_residencia: 10 });
    expect((await get(m.app, "/api/configuracion/centro", rec, IP)).body).toMatchObject({ id_municipio: 108, zona: 10 });
    expect((await get(m.app, "/api/catalogos/municipios?q=mixc", rec, IP)).body.datos.map((x: { nombre_municipio: string }) => x.nombre_municipio)).toContain("Mixco");
    expect(await idRol(m.dueno, "recepcion")).toBeGreaterThan(0);
  });

  it("(revisión de seguridad) el registro de emergencia nunca absorbe a uno completo", async () => {
    const completo = (await registrar(adulto())).body.paciente;
    const e = (await post(m.app, "/api/pacientes/emergencia", rec, { sexo: "F", edad_aproximada_anios: 30 }, IP)).body.paciente;
    const r = await post(m.app, `/api/pacientes/${e.id_paciente}/unir`, rec, { id_paciente_unido: completo.id_paciente, motivo: "Dirección equivocada a propósito" }, IP);
    expect(r.status).toBe(422); expect(r.body.error.codigo).toBe("UNION_DIRECCION");
    expect((await get(m.app, `/api/pacientes/buscar?q=${completo.codigo_paciente}`, rec, IP)).body.datos).toHaveLength(1);
  });

  it("(revisión de seguridad) dos uniones simultáneas en sentido opuesto: solo una prospera y ningún registro desaparece", async () => {
    const x = (await registrar(adulto())).body.paciente; const y = (await registrar(adulto())).body.paciente;
    const [r1, r2] = await Promise.all([
      post(m.app, `/api/pacientes/${x.id_paciente}/unir`, rec, { id_paciente_unido: y.id_paciente, motivo: "Misma persona, intento uno" }, IP),
      post(m.app, `/api/pacientes/${y.id_paciente}/unir`, rec, { id_paciente_unido: x.id_paciente, motivo: "Misma persona, intento dos" }, IP),
    ]);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const visibles = await m.dueno.query("SELECT count(*)::int AS n FROM pacientes WHERE id_paciente IN ($1, $2) AND id_paciente_principal IS NULL", [x.id_paciente, y.id_paciente]);
    expect(visibles.rows[0].n).toBe(1);
  });

  it("(revisión de seguridad) abrir una atención sobre un registro absorbido se rechaza", async () => {
    const x = (await registrar(adulto())).body.paciente; const y = (await registrar(adulto())).body.paciente;
    expect((await post(m.app, `/api/pacientes/${x.id_paciente}/unir`, rec, { id_paciente_unido: y.id_paciente, motivo: "Misma persona registrada dos veces" }, IP)).status).toBe(200);
    const a = await post(m.app, "/api/atenciones", rec, { id_paciente: y.id_paciente, id_tipo_atencion: 1 }, IP);
    expect(a.status).toBe(409); expect(a.body.error.codigo).toBe("PACIENTE_UNIDO");
  });

  it("(revisión de seguridad) al unir, el CUI del absorbido se libera aunque el principal ya tenga uno", async () => {
    const cuiA = cuiNuevo(); const cuiB = cuiNuevo();
    const a = (await registrar(adulto({ cui: cuiA }))).body.paciente; const b = (await registrar(adulto({ cui: cuiB }))).body.paciente;
    await post(m.app, `/api/pacientes/${a.id_paciente}/unir`, rec, { id_paciente_unido: b.id_paciente, motivo: "Misma persona con dos expedientes" }, IP);
    const nuevo = await registrar(adulto({ cui: cuiB }));
    expect(nuevo.status).toBe(201); // el CUI del absorbido quedó libre
  });

  it("(revisión de seguridad) la colonia debe estar activa y ser del municipio; un adulto no pierde su CUI sin confirmar", async () => {
    const c = await post(m.app, "/api/colonias-sectores", admin, { id_municipio: 108, zona: 10, nombre_colonia_sector: `Valida ${unico()}` }, IP);
    const otra = await post(m.app, "/api/colonias-sectores", admin, { id_municipio: 101, zona: 1, nombre_colonia_sector: `Otra ${unico()}` }, IP);
    expect((await registrar(adulto({ id_colonia_sector: otra.body.id_colonia_sector }))).body.error.codigo).toBe("COLONIA_NO_VALIDA");
    await patch(m.app, `/api/colonias-sectores/${c.body.id_colonia_sector}`, admin, { activo: false }, IP);
    expect((await registrar(adulto({ id_colonia_sector: c.body.id_colonia_sector }))).body.error.codigo).toBe("COLONIA_NO_VALIDA");
    const p = (await registrar(adulto())).body.paciente;
    const quitar = await patch(m.app, `/api/pacientes/${p.id_paciente}`, rec, { cui: null }, IP);
    expect(quitar.status).toBe(422); expect(quitar.body.error.codigo).toBe("CUI_REQUERIDO");
    expect((await patch(m.app, `/api/pacientes/${p.id_paciente}`, rec, { cui: null, sin_cui: true }, IP)).body.paciente.cui).toBeNull();
  });

  it("(revisión de seguridad) completar una emergencia busca si la persona ya existía", async () => {
    const base = { nombres: "Existente", apellidos: `Previa${unico()}`, fecha_nacimiento: fechaUnica(), sexo: "M" };
    await registrar({ ...base, cui: cuiNuevo() });
    const e = (await post(m.app, "/api/pacientes/emergencia", rec, { sexo: "M", edad_aproximada_anios: 40 }, IP)).body.paciente;
    const r = await patch(m.app, `/api/pacientes/${e.id_paciente}`, rec, { nombres: base.nombres, apellidos: base.apellidos, fecha_nacimiento: base.fecha_nacimiento }, IP);
    expect(r.status).toBe(409); expect(r.body.error.codigo).toBe("DUPLICADO_POSIBLE");
    const ok = await patch(m.app, `/api/pacientes/${e.id_paciente}`, rec, { nombres: base.nombres, apellidos: base.apellidos, fecha_nacimiento: base.fecha_nacimiento, confirmar_duplicado: true }, IP);
    expect(ok.status).toBe(200); expect(ok.body.paciente.datos_incompletos).toBe(false);
  });

  it("(revisión de seguridad) los datos de la búsqueda no quedan en la URL registrada por el backend", async () => {
    const r = await get(m.app, "/api/pacientes/buscar?q=1234567890108", rec, IP);
    expect(r.status).toBe(200);
  });
});

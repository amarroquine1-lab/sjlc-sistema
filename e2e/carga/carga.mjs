// Prueba de carga ligera: 20 sesiones simultáneas (10 con trabajo real de punta a punta y 10 que consultan las colas
// como lo hacen las pantallas). Uso: URL_BASE=http://localhost:18080 PRUEBAS_CONTRASENA=… DURACION=60 node carga.mjs
const BASE = process.env.URL_BASE ?? "http://localhost:18080";
const CLAVE = process.env.PRUEBAS_CONTRASENA;
const DURACION = Number(process.env.DURACION ?? 60) * 1000;
if (!CLAVE) { console.error("Falta PRUEBAS_CONTRASENA"); process.exit(2); }

const medidas = new Map(); // "METODO ruta" -> { ms: [], errores: 0, n: 0 }
const inesperados = [];
let ipN = 10;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const azar = (n) => Math.floor(Math.random() * n);

async function sesion(usuario) {
  const ip = `198.51.100.${ipN++}`;
  const r = await fetch(`${BASE}/api/autenticacion/ingresar`, { method: "POST", headers: { "content-type": "application/json", "x-forwarded-for": ip, origin: BASE }, body: JSON.stringify({ usuario, contrasena: CLAVE }) });
  if (!r.ok) throw new Error(`No se pudo ingresar como ${usuario}: ${r.status}`);
  const cookie = r.headers.getSetCookie().map((c) => c.split(";")[0]).join("; ");
  return async (metodo, ruta, cuerpo, { auto = false, esperados = [] } = {}) => {
    const t0 = performance.now();
    const res = await fetch(`${BASE}${ruta}`, { method: metodo, headers: { "content-type": "application/json", cookie, "x-forwarded-for": ip, origin: BASE, ...(auto ? { "x-actividad": "automatica" } : {}) }, body: cuerpo ? JSON.stringify(cuerpo) : undefined });
    const ms = performance.now() - t0;
    const clave = `${metodo} ${ruta.replace(/\/\d+/g, "/:id").replace(/\?.*/, "")}`;
    const m = medidas.get(clave) ?? { ms: [], errores: 0, n: 0 }; medidas.set(clave, m);
    m.n++; m.ms.push(ms);
    const json = await res.json().catch(() => null);
    if (res.status >= 500 || (res.status >= 400 && !esperados.includes(res.status))) { m.errores++; inesperados.push(`${clave} → ${res.status} ${json?.error?.codigo ?? ""}`); }
    return { status: res.status, json };
  };
}

// Colas limpias: el seed de pruebas deja pacientes en atención
{ const a = await sesion("padmin"); const r = await a("POST", "/api/administracion/cierre-del-dia", {}); if (r.status !== 200) { console.error("No se pudo limpiar las colas", r.status); process.exit(2); } medidas.clear(); }

const fin = Date.now() + DURACION;
const vivo = () => Date.now() < fin;
const cuiAzar = () => { for (;;) { const b = String(10000000 + azar(89999999)); let t = 0; for (let i = 0; i < 8; i++) t += Number(b[i]) * (i + 2); if (t % 11 < 10) return `${b}${t % 11}0108`; } };
const letras = (n) => Array.from({ length: n }, () => "abcdefghijklmnopqrstuvwxyz"[azar(26)]).join("");

async function recepcion(i) {
  const api = await sesion("precepcion");
  while (vivo()) {
    if (azar(6) === 0) await api("POST", "/api/pacientes/emergencia", { sexo: "M", edad_aproximada_anios: 30 });
    else {
      const p = await api("POST", "/api/pacientes", { nombres: "Carga", apellidos: `Prueba${letras(10)}`, fecha_nacimiento: new Date(Date.UTC(1930, 0, 1) + azar(27000) * 86400000).toISOString().slice(0, 10), sexo: "F", cui: cuiAzar() }, { esperados: [409] });
      if (p.status === 201) await api("POST", "/api/atenciones", { id_paciente: p.json.paciente.id_paciente, id_tipo_atencion: 1 });
    }
    await api("GET", `/api/pacientes/buscar?q=${encodeURIComponent("Carga")}`);
    await dormir(800 + azar(800));
  }
}

async function area(usuario, clave, trabajo) {
  const api = await sesion(usuario);
  while (vivo()) {
    const sig = await api("POST", `/api/cola/${clave}/llamar-siguiente`, {}, { esperados: [404, 409] });
    if (sig.status === 200) { await dormir(300 + azar(500)); await trabajo(api, sig.json); }
    else await dormir(1000);
  }
}

const hacia = (destino) => (api, p) => api("POST", `/api/atenciones/${p.atencion.id_atencion}/enviar`, { destino }, { esperados: [409, 422] });
const trabajos = {
  signos: async (api, p) => { await api("POST", `/api/atenciones/${p.atencion.id_atencion}/signos`, { peso_lb: 132, talla_cm: 160, temperatura_c: 36.7, presion_sistolica: 120, presion_diastolica: 80 }, { esperados: [409] }); await hacia("doctor")(api, p); },
  doctor: async (api, p) => {
    await api("PUT", `/api/atenciones/${p.atencion.id_atencion}/consulta`, { tipo_consulta: "primera", motivo_consulta: "Prueba de carga", diagnosticos: [{ descripcion_diagnostico: "Control" }] }, { esperados: [409] });
    await hacia("finalizar")(api, p);
  },
};

async function sondeo(usuario, clave) {
  const api = await sesion(usuario);
  while (vivo()) { await api("GET", `/api/cola/${clave}`, undefined, { auto: true }); await dormir(5000 + azar(500)); }
}
async function administracion() {
  const api = await sesion("padmin");
  while (vivo()) {
    await api("GET", "/api/administracion/colas", undefined, { auto: true });
    await api("GET", `/api/reportes/atenciones?desde=${new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)}&hasta=${new Date().toISOString().slice(0, 10)}`);
    await dormir(4000);
  }
}

const tareas = [
  recepcion(1), recepcion(2), recepcion(3),
  area("psignos", "signos", trabajos.signos), area("pdoctor", "doctor", trabajos.doctor), area("pdoctora", "doctor", trabajos.doctor),
  administracion(),
  sondeo("psignos", "signos"), sondeo("pdoctor", "doctor"), sondeo("pdoctora", "doctor"), sondeo("pnutricion", "nutricion"), sondeo("pvacunacion", "vacunacion"), sondeo("pfarmacia", "farmacia"),
  sondeo("padmin", "doctor"), sondeo("padmin", "signos"), sondeo("padmin", "farmacia"), sondeo("padmin", "nutricion"), sondeo("padmin", "vacunacion"),
  recepcion(4), recepcion(5),
];
console.log(`Sesiones simultáneas: ${tareas.length}, duración ${DURACION / 1000} s`);
const resultados = await Promise.allSettled(tareas);
const caidas = resultados.filter((r) => r.status === "rejected");

const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
let total = 0, errores = 0;
console.log("\nEndpoint".padEnd(46) + "n".padStart(6) + "p50".padStart(8) + "p95".padStart(8) + "máx".padStart(8) + "err".padStart(6));
for (const [k, m] of [...medidas].sort()) {
  total += m.n; errores += m.errores;
  console.log(k.padEnd(45) + String(m.n).padStart(6) + pct(m.ms, 0.5).toFixed(0).padStart(8) + pct(m.ms, 0.95).toFixed(0).padStart(8) + Math.max(...m.ms).toFixed(0).padStart(8) + String(m.errores).padStart(6));
}
const todos = [...medidas.values()].flatMap((m) => m.ms);
console.log(`\nPeticiones: ${total} (${(total / (DURACION / 1000)).toFixed(1)}/s) · errores inesperados: ${errores} · p95 global ${pct(todos, 0.95).toFixed(0)} ms · p99 ${pct(todos, 0.99).toFixed(0)} ms`);
if (inesperados.length) console.log("Primeros errores:", [...new Set(inesperados)].slice(0, 8).join(" | "));
if (caidas.length) console.log("Sesiones caídas:", caidas.map((c) => String(c.reason)).slice(0, 5).join(" | "));
process.exit(errores > 0 || caidas.length > 0 || pct(todos, 0.95) > 1500 ? 1 : 0);

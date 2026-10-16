import { readFile } from "node:fs/promises";
import path from "node:path";
import { hash } from "@node-rs/argon2";
import type pg from "pg";
import { conexionDueno } from "./conexion.js";
import {
  dividirNombre,
  exigirVariables,
  validarContrasena,
  validarNombreUsuario,
} from "./utilidades.js";

// Algoritmo.Argon2id = 2 en @node-rs/argon2 (se usa el valor numérico para evitar enums const).
const ARGON2ID = 2;

interface UsuarioNuevo {
  nombreUsuario: string;
  nombres: string;
  apellidos: string;
  rol: string;
  contrasena: string;
  debeCambiar: boolean;
}

async function ejecutarSql(cliente: pg.PoolClient, dirDb: string, archivo: string): Promise<void> {
  const sql = await readFile(path.join(dirDb, archivo), "utf8");
  try {
    await cliente.query("BEGIN");
    await cliente.query(sql);
    await cliente.query("COMMIT");
  } catch (error) {
    await cliente.query("ROLLBACK").catch(() => undefined);
    throw new Error(`Falló ${archivo}: ${(error as Error).message}`);
  }
  console.log(`Ejecutado: ${archivo}`);
}

async function crearUsuario(cliente: pg.PoolClient, u: UsuarioNuevo): Promise<void> {
  if (!validarNombreUsuario(u.nombreUsuario)) {
    throw new Error(`El nombre de usuario "${u.nombreUsuario}" solo puede tener letras minúsculas sin tildes ni ñ.`);
  }
  if (!validarContrasena(u.contrasena)) {
    throw new Error(`La contraseña de "${u.nombreUsuario}" debe tener al menos 10 caracteres.`);
  }
  const existe = await cliente.query("SELECT 1 FROM usuarios WHERE nombre_usuario = $1", [u.nombreUsuario]);
  if (existe.rowCount && existe.rowCount > 0) {
    console.log(`Usuario omitido (ya existe): ${u.nombreUsuario}`);
    return;
  }
  const rol = await cliente.query<{ id_rol: number }>("SELECT id_rol FROM roles WHERE nombre_rol = $1", [u.rol]);
  if (rol.rowCount === 0) {
    throw new Error(`No existe el rol "${u.rol}". Ejecute primero las migraciones y el seed de producción.`);
  }
  const contrasenaHash = await hash(u.contrasena, { algorithm: ARGON2ID });
  await cliente.query(
    `INSERT INTO usuarios (nombre_usuario, nombres, apellidos, id_rol, contrasena_hash, debe_cambiar_contrasena)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [u.nombreUsuario, u.nombres, u.apellidos, rol.rows[0].id_rol, contrasenaHash, u.debeCambiar],
  );
  console.log(`Usuario creado: ${u.nombreUsuario}`);
}

async function crearAdministradores(cliente: pg.PoolClient): Promise<void> {
  for (const n of ["1", "2"]) {
    const v = exigirVariables([`ADMIN${n}_USUARIO`, `ADMIN${n}_NOMBRE`, `ADMIN${n}_CONTRASENA_TEMPORAL`]);
    const { nombres, apellidos } = dividirNombre(v[`ADMIN${n}_NOMBRE`]);
    await crearUsuario(cliente, {
      nombreUsuario: v[`ADMIN${n}_USUARIO`],
      nombres,
      apellidos,
      rol: "administrador",
      contrasena: v[`ADMIN${n}_CONTRASENA_TEMPORAL`],
      debeCambiar: true,
    });
  }
}

const USUARIOS_PRUEBA: Array<[string, string, string, string]> = [
  ["padmin", "Prueba Administrador", "Ficticio", "administrador"],
  ["precepcion", "Prueba Recepcion", "Ficticio", "recepcion"],
  ["psignos", "Prueba Signos", "Ficticio", "signos"],
  ["pdoctor", "Prueba Doctor", "Ficticio", "doctor"],
  ["pdoctora", "Prueba Doctora", "Ficticia", "doctor"],
  ["pnutricion", "Prueba Nutricion", "Ficticia", "nutricion"],
  ["pvacunacion", "Prueba Vacunacion", "Ficticia", "vacunacion"],
  ["pfarmacia", "Prueba Farmacia", "Ficticia", "farmacia"],
];

async function principal(): Promise<void> {
  const modo = process.argv[2];
  if (modo !== "produccion" && modo !== "pruebas") {
    throw new Error('Indique el modo: "produccion" o "pruebas".');
  }
  const entorno = (process.env.ENTORNO || "").trim();
  if (modo === "pruebas" && (entorno === "" || entorno === "produccion")) {
    throw new Error("El seed de pruebas no se puede ejecutar: ENTORNO está vacío o es \"produccion\".");
  }

  const dirDb = process.env.DIR_DB || "/app/db";
  const pool = conexionDueno();
  const cliente = await pool.connect();
  try {
    if (modo === "pruebas") {
      await cliente.query("SELECT set_config('sjlc.entorno', $1, false)", [entorno]);
    }
    await ejecutarSql(cliente, dirDb, "seed-produccion.sql");
    await ejecutarSql(cliente, dirDb, "seed-municipios.sql");

    if (modo === "produccion") {
      await crearAdministradores(cliente);
    } else {
      const { PRUEBAS_CONTRASENA } = exigirVariables(["PRUEBAS_CONTRASENA"]);
      for (const [nombreUsuario, nombres, apellidos, rol] of USUARIOS_PRUEBA) {
        await crearUsuario(cliente, {
          nombreUsuario, nombres, apellidos, rol,
          contrasena: PRUEBAS_CONTRASENA,
          debeCambiar: false,
        });
      }
      await ejecutarSql(cliente, dirDb, "seed-pruebas.sql");
    }
  } finally {
    cliente.release();
    await pool.end();
  }
}

principal().catch((error: Error) => {
  console.error(`Error al sembrar: ${error.message}`);
  process.exit(1);
});

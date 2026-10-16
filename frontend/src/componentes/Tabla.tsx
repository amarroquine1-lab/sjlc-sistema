import type { ReactNode } from "react";

export interface Columna<T> { titulo: string; celda: (fila: T) => ReactNode }

export function Tabla<T>({ columnas, filas, clave, vacio = "No hay registros." }: { columnas: Columna<T>[]; filas: T[]; clave: (f: T) => string | number; vacio?: string }) {
  if (filas.length === 0) return <p>{vacio}</p>;
  return (
    <div className="tabla-desplazable" tabIndex={0} role="region" aria-label="Tabla">
    <table className="tabla">
      <thead><tr>{columnas.map((c) => <th key={c.titulo} scope="col">{c.titulo}</th>)}</tr></thead>
      <tbody>{filas.map((f) => <tr key={clave(f)}>{columnas.map((c) => <td key={c.titulo}>{c.celda(f)}</td>)}</tr>)}</tbody>
    </table>
    </div>
  );
}

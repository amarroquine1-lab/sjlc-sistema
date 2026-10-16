import { Search } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Boton } from "./Boton";

// Un solo campo para código, DPI/CUI, nombre, fecha de nacimiento o DPI del encargado.
export function Buscador({ alBuscar, cargando }: { alBuscar: (texto: string) => void; cargando?: boolean }) {
  const [texto, setTexto] = useState("");
  const enviar = (e: FormEvent) => { e.preventDefault(); if (texto.trim()) alBuscar(texto.trim()); };
  return (
    <form className="buscador" role="search" onSubmit={enviar}>
      <label className="solo-lectores" htmlFor="buscar">Buscar paciente por código, DPI, nombre o fecha de nacimiento</label>
      <input id="buscar" type="search" value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Código, DPI, nombre o fecha" autoComplete="off" />
      <Boton type="submit" icono={<Search aria-hidden="true" size={22} />} cargando={cargando}>Buscar</Boton>
    </form>
  );
}

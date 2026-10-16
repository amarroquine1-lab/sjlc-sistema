import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import type { ReactNode } from "react";
import { CambioContrasena } from "./paginas/CambioContrasena";
import { Ingreso } from "./paginas/Ingreso";
import { Emergencia } from "./paginas/Emergencia";
import { FormularioPaciente } from "./paginas/FormularioPaciente";
import { Inicio } from "./paginas/Inicio";
import { AdminBitacora } from "./paginas/AdminBitacora";
import { AdminColas } from "./paginas/AdminColas";
import { AdminUsuarios } from "./paginas/AdminUsuarios";
import { Reportes } from "./paginas/Reportes";
import { Historial } from "./paginas/Historial";
import { Doctor } from "./paginas/Doctor";
import { Farmacia } from "./paginas/Farmacia";
import { Nutricion } from "./paginas/Nutricion";
import { Vacunacion } from "./paginas/Vacunacion";
import { Signos } from "./paginas/Signos";
import { PantallaArea } from "./paginas/PantallaArea";
import { Recepcion } from "./paginas/Recepcion";
import { Ticket } from "./paginas/Ticket";
import { NoAutorizado, NoEncontrada } from "./paginas/Mensajes";
import type { Rol } from "./api/tipos";
import { ProveedorSesion, useSesion } from "./sesion/ContextoSesion";

function Protegida({ children, roles }: { children: ReactNode; roles?: Rol[] }) {
  const { yo, cargando } = useSesion();
  if (cargando) return <main className="pagina"><p>Cargando…</p></main>;
  if (!yo) return <Navigate to="/ingreso" replace />;
  if (yo.debe_cambiar_contrasena) return <Navigate to="/cambiar-contrasena" replace />;
  if (roles && !roles.includes(yo.rol)) return <NoAutorizado />;
  return <>{children}</>;
}

const RECEPCION: Rol[] = ["administrador", "recepcion"];
const DE = (r: Rol): Rol[] => ["administrador", r];

export function App() {
  return (
    <ProveedorSesion>
      <BrowserRouter>
        <Routes>
          <Route path="/ingreso" element={<Ingreso />} />
          <Route path="/cambiar-contrasena" element={<CambioContrasena />} />
          <Route path="/" element={<Protegida><Inicio /></Protegida>} />
          <Route path="/recepcion" element={<Protegida roles={RECEPCION}><Recepcion /></Protegida>} />
          <Route path="/recepcion/nuevo" element={<Protegida roles={RECEPCION}><FormularioPaciente /></Protegida>} />
          <Route path="/recepcion/paciente/:id/editar" element={<Protegida roles={RECEPCION}><FormularioPaciente /></Protegida>} />
          <Route path="/recepcion/emergencia" element={<Protegida roles={RECEPCION}><Emergencia /></Protegida>} />
          <Route path="/recepcion/ticket/:id" element={<Protegida roles={RECEPCION}><Ticket /></Protegida>} />
          <Route path="/signos" element={<Protegida roles={DE("signos")}><Signos /></Protegida>} />
          <Route path="/doctor" element={<Protegida roles={DE("doctor")}><Doctor /></Protegida>} />
          <Route path="/nutricion" element={<Protegida roles={DE("nutricion")}><Nutricion /></Protegida>} />
          <Route path="/vacunacion" element={<Protegida roles={DE("vacunacion")}><Vacunacion /></Protegida>} />
          <Route path="/farmacia" element={<Protegida roles={DE("farmacia")}><Farmacia /></Protegida>} />
          <Route path="/historial" element={<Protegida><Historial /></Protegida>} />
          <Route path="/historial/:id" element={<Protegida><Historial /></Protegida>} />
          <Route path="/administracion/usuarios" element={<Protegida roles={["administrador"]}><AdminUsuarios /></Protegida>} />
          <Route path="/administracion/bitacora" element={<Protegida roles={["administrador"]}><AdminBitacora /></Protegida>} />
          <Route path="/administracion/colas" element={<Protegida roles={["administrador"]}><AdminColas /></Protegida>} />
          <Route path="/reportes" element={<Protegida roles={["administrador"]}><Reportes /></Protegida>} />
          <Route path="*" element={<NoEncontrada />} />
        </Routes>
      </BrowserRouter>
    </ProveedorSesion>
  );
}

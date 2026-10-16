import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { alVencerSesion, api, ErrorDeApi } from "../api/cliente";
import type { Yo } from "../api/tipos";

interface Valor {
  yo: Yo | null;
  cargando: boolean;
  avisoVencimiento: boolean;
  motivoSalida: string | null;
  recargar: () => Promise<Yo | null>;
  ingresar: (usuario: string, contrasena: string) => Promise<Yo>;
  salir: () => Promise<void>;
  seguirTrabajando: () => void;
}

const Contexto = createContext<Valor | null>(null);
const MINUTOS_INACTIVIDAD = 15;
const MINUTOS_AVISO = 13;

export function ProveedorSesion({ children }: { children: ReactNode }) {
  const [yo, setYo] = useState<Yo | null>(null);
  const [cargando, setCargando] = useState(true);
  const [avisoVencimiento, setAviso] = useState(false);
  const [motivoSalida, setMotivo] = useState<string | null>(null);
  const yoRef = useRef<Yo | null>(null);
  yoRef.current = yo;
  const ultimaActividad = useRef(Date.now());
  const ultimoAviso = useRef(0);

  const recargar = useCallback(async () => {
    try {
      const u = await api.get<Yo>("/api/yo");
      setYo(u);
      return u;
    } catch {
      setYo(null);
      return null;
    }
  }, []);

  useEffect(() => { void recargar().finally(() => setCargando(false)); }, [recargar]);

  useEffect(() => {
    // Solo se avisa de la inactividad si había una sesión abierta (un 401 al cargar la página sin ingresar no es un vencimiento)
    alVencerSesion(() => { if (yoRef.current) { setYo(null); setMotivo("Su sesión terminó por inactividad. Inicie sesión de nuevo."); } });
  }, []);

  // La inactividad se mide en el navegador con la actividad real de la persona; el servidor tiene la última palabra.
  useEffect(() => {
    if (!yo) return;
    const marcar = () => { ultimaActividad.current = Date.now(); if (avisoVencimiento) return; };
    const eventos = ["pointerdown", "keydown", "scroll"] as const;
    eventos.forEach((e) => window.addEventListener(e, marcar, { passive: true }));
    const reloj = window.setInterval(() => {
      const minutos = (Date.now() - ultimaActividad.current) / 60000;
      if (minutos >= MINUTOS_INACTIVIDAD) { setYo(null); setAviso(false); setMotivo("Su sesión terminó por inactividad. Inicie sesión de nuevo."); void api.post("/api/autenticacion/salir").catch(() => undefined); }
      else if (minutos >= MINUTOS_AVISO) setAviso(true);
      else {
        setAviso(false);
        // Mientras trabaja, se avisa al servidor como máximo una vez por minuto para mantener la sesión
        if (Date.now() - ultimoAviso.current > 60000 && minutos < 1) { ultimoAviso.current = Date.now(); void api.get("/api/yo").catch(() => undefined); }
      }
    }, 5000);
    return () => { eventos.forEach((e) => window.removeEventListener(e, marcar)); window.clearInterval(reloj); };
  }, [yo, avisoVencimiento]);

  const ingresar = useCallback(async (usuario: string, contrasena: string) => {
    await api.post("/api/autenticacion/ingresar", { usuario, contrasena });
    ultimaActividad.current = Date.now();
    setMotivo(null);
    const u = await api.get<Yo>("/api/yo");
    setYo(u);
    return u;
  }, []);

  const salir = useCallback(async () => {
    try { await api.post("/api/autenticacion/salir"); } catch (e) { if (!(e instanceof ErrorDeApi)) throw e; }
    setYo(null); setAviso(false); setMotivo(null);
  }, []);

  const seguirTrabajando = useCallback(() => { ultimaActividad.current = Date.now(); setAviso(false); void api.get("/api/yo").catch(() => undefined); }, []);

  const valor = useMemo(() => ({ yo, cargando, avisoVencimiento, motivoSalida, recargar, ingresar, salir, seguirTrabajando }),
    [yo, cargando, avisoVencimiento, motivoSalida, recargar, ingresar, salir, seguirTrabajando]);
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion(): Valor {
  const v = useContext(Contexto);
  if (!v) throw new Error("useSesion fuera del ProveedorSesion");
  return v;
}

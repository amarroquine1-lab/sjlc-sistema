import type { ReactNode } from "react";

// Ilustraciones de línea simple, propias del centro de salud. Decorativas: el texto que las acompaña dice lo mismo.
// Los colores vienen de clases (la CSP no admite estilos en línea) y del color del área (data-area).
function Lienzo({ ancho, alto, caja, children, clase = "" }: { ancho: number; alto: number; caja: string; children: ReactNode; clase?: string }) {
  return <svg className={`il ${clase}`} width={ancho} height={alto} viewBox={caja} aria-hidden="true" focusable="false">{children}</svg>;
}
interface Props { tamano?: number; clase?: string }

export function Termometro({ tamano = 120, clase }: Props) {
  return (
    <Lienzo ancho={tamano} alto={tamano} caja="0 0 160 160" clase={clase}>
      <circle className="il-maiz il-t" cx="124" cy="40" r="11" />
      <rect className="il-blanco il-t" x="64" y="16" width="24" height="98" rx="12" />
      <rect className="il-area" x="71" y="54" width="10" height="62" rx="5" />
      <circle className="il-area il-t" cx="76" cy="124" r="22" />
      <path className="il-t" d="M94 34h9M94 50h6M94 66h9M94 82h6" />
      <polyline className="il-t il-coral-trazo" points="108,128 120,128 126,110 136,146 144,122 152,128" />
    </Lienzo>
  );
}

export function Estetoscopio({ tamano = 120, clase }: Props) {
  return (
    <Lienzo ancho={tamano} alto={tamano} caja="0 0 160 160" clase={clase}>
      <circle className="il-maiz il-t" cx="48" cy="22" r="8" />
      <circle className="il-maiz il-t" cx="112" cy="22" r="8" />
      <path className="il-t il-grueso" d="M48 30c0 40 8 62 32 62s32-22 32-62" />
      <path className="il-t il-grueso" d="M80 92v22c0 18 30 18 30 0" />
      <circle className="il-area il-t" cx="110" cy="122" r="17" />
      <circle className="il-blanco il-t" cx="110" cy="122" r="7" />
      <path className="il-coral-trazo il-t" d="M26 128h14l5-12 7 24 6-18 4 6h12" />
    </Lienzo>
  );
}

export function Bascula({ tamano = 120, clase }: Props) {
  return (
    <Lienzo ancho={tamano} alto={tamano} caja="0 0 160 160" clase={clase}>
      <rect className="il-fondo il-t" x="26" y="44" width="108" height="92" rx="20" />
      <circle className="il-blanco il-t" cx="80" cy="84" r="30" />
      <path className="il-t" d="M80 60v6M58 70l4 4M102 70l-4 4M52 90h6M108 90h-6" />
      <path className="il-t il-grueso il-area-trazo" d="M80 84l14-16" />
      <circle className="il-area" cx="80" cy="84" r="4" />
      <path className="il-t" d="M44 136v8M116 136v8" />
      <circle className="il-area il-t" cx="128" cy="30" r="11" />
      <path className="il-verde-trazo il-t" d="M128 20c0-6 4-9 8-9" />
    </Lienzo>
  );
}

export function Vacuna({ tamano = 120, clase }: Props) {
  return (
    <Lienzo ancho={tamano} alto={tamano} caja="0 0 160 160" clase={clase}>
      <g transform="rotate(-45 80 80)">
        <rect className="il-blanco il-t" x="44" y="68" width="66" height="24" rx="5" />
        <rect className="il-area" x="50" y="74" width="34" height="12" rx="3" />
        <path className="il-t" d="M44 80H26M26 70v20M110 80h30M104 62v36M52 62v36" />
        <path className="il-t il-grueso" d="M110 80h32" />
      </g>
      <path className="il-coral il-t" d="M124 34c6 9 10 14 10 20a10 10 0 0 1-20 0c0-6 4-11 10-20z" />
      <circle className="il-maiz il-t" cx="36" cy="40" r="9" />
      <path className="il-t" d="M30 40h12M36 34v12" />
    </Lienzo>
  );
}

export function Frasco({ tamano = 120, clase }: Props) {
  return (
    <Lienzo ancho={tamano} alto={tamano} caja="0 0 160 160" clase={clase}>
      <rect className="il-fondo il-t" x="44" y="58" width="64" height="80" rx="12" />
      <rect className="il-area il-t" x="50" y="34" width="52" height="26" rx="6" />
      <path className="il-t" d="M58 34v26M66 34v26M74 34v26M82 34v26M90 34v26" />
      <rect className="il-blanco il-t" x="54" y="82" width="44" height="36" rx="5" />
      <path className="il-area-trazo il-t il-grueso" d="M76 90v20M66 100h20" />
      <g transform="rotate(-30 128 120)">
        <rect className="il-maiz il-t" x="112" y="108" width="34" height="16" rx="8" />
        <path className="il-t" d="M129 108v16" />
      </g>
      <circle className="il-blanco il-t" cx="128" cy="140" r="8" />
    </Lienzo>
  );
}

export function FamiliaEnEspera({ tamano = 120, clase }: Props) {
  return (
    <Lienzo ancho={tamano} alto={tamano} caja="0 0 160 160" clase={clase}>
      <circle className="il-blanco il-t" cx="128" cy="30" r="14" />
      <path className="il-t" d="M128 22v8l6 4" />
      <circle className="il-turquesa il-t" cx="46" cy="62" r="11" />
      <rect className="il-turquesa il-t" x="33" y="76" width="26" height="38" rx="11" />
      <circle className="il-coral il-t" cx="88" cy="58" r="11" />
      <rect className="il-coral il-t" x="75" y="72" width="26" height="42" rx="11" />
      <circle className="il-maiz il-t" cx="124" cy="84" r="8" />
      <rect className="il-maiz il-t" x="115" y="95" width="18" height="19" rx="8" />
      <rect className="il-area il-t" x="14" y="112" width="132" height="12" rx="4" />
      <path className="il-t" d="M26 124v20M134 124v20" />
    </Lienzo>
  );
}

// Fachada del centro con columnas azules y la comunidad (portada del ingreso)
export function CentroYComunidad({ ancho = 520 }: { ancho?: number }) {
  return (
    <Lienzo ancho={ancho} alto={Math.round(ancho * 0.77)} caja="0 0 520 400" clase="il--centro">
      <circle className="il-maiz" cx="428" cy="78" r="34" />
      <path className="il-nube" d="M60 96h70a18 18 0 0 0-4-35 26 26 0 0 0-50-4 20 20 0 0 0-16 39z" />
      <rect className="il-suelo" x="-400" y="320" width="1320" height="90" />
      <polygon className="il-blanco il-t" points="120,140 260,70 400,140" />
      <circle className="il-celeste il-t" cx="260" cy="112" r="14" />
      <path className="il-blanco-trazo il-t il-grueso" d="M260 104v16M252 112h16" />
      <rect className="il-blanco il-t" x="112" y="140" width="296" height="18" rx="2" />
      <g>
        <rect className="il-celeste il-t" x="132" y="158" width="26" height="140" />
        <rect className="il-celeste il-t" x="186" y="158" width="26" height="140" />
        <rect className="il-celeste il-t" x="308" y="158" width="26" height="140" />
        <rect className="il-celeste il-t" x="362" y="158" width="26" height="140" />
      </g>
      <rect className="il-blanco il-t" x="214" y="158" width="92" height="140" />
      <path className="il-marino il-t" d="M236 298v-62a24 24 0 0 1 48 0v62z" />
      <rect className="il-blanco il-t" x="100" y="298" width="320" height="14" rx="2" />
      <rect className="il-blanco il-t" x="88" y="312" width="344" height="14" rx="2" />
      <circle className="il-verde il-t" cx="48" cy="262" r="38" />
      <rect className="il-t il-marino" x="44" y="292" width="8" height="34" />
      <circle className="il-verde il-t" cx="474" cy="270" r="32" />
      <rect className="il-t il-marino" x="470" y="296" width="8" height="30" />
      <g>
        <circle className="il-coral il-t" cx="154" cy="346" r="10" /><rect className="il-coral il-t" x="144" y="358" width="20" height="26" rx="8" />
        <circle className="il-turquesa il-t" cx="196" cy="344" r="10" /><rect className="il-turquesa il-t" x="186" y="356" width="20" height="28" rx="8" />
        <circle className="il-maiz il-t" cx="226" cy="360" r="7" /><rect className="il-maiz il-t" x="219" y="369" width="14" height="16" rx="6" />
        <circle className="il-blanco il-t" cx="318" cy="344" r="10" /><rect className="il-blanco il-t" x="308" y="356" width="20" height="28" rx="8" />
        <circle className="il-coral il-t" cx="352" cy="348" r="9" /><rect className="il-coral il-t" x="343" y="359" width="18" height="26" rx="8" />
        <circle className="il-celeste il-t" cx="384" cy="362" r="7" /><rect className="il-celeste il-t" x="377" y="371" width="14" height="14" rx="6" />
      </g>
    </Lienzo>
  );
}

export const ILUSTRACION_DE_AREA: Record<string, (p: Props) => ReactNode> = {
  recepcion: FamiliaEnEspera, signos: Termometro, doctor: Estetoscopio, nutricion: Bascula, vacunacion: Vacuna, farmacia: Frasco,
};

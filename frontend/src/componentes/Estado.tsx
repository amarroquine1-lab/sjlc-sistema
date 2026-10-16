const TEXTOS: Record<string, string> = {
  en_espera: "En espera", en_atencion: "En atención", enviado: "Enviado", finalizada: "Finalizada",
  se_retiro: "Se retiró", no_concluida: "No concluida", emergencia: "Emergencia",
};

export function Estado({ valor }: { valor: string }) {
  return <span className={`estado estado--${valor}`}>{TEXTOS[valor] ?? valor}</span>;
}

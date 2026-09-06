/** Formata uma duração em segundos como HH:MM:SS (regra 6). */
export function formatarDuracao(segundosTotais: number): string {
  const s = Math.max(0, Math.floor(segundosTotais));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  return [h, m, seg].map((n) => String(n).padStart(2, "0")).join(":");
}

/** Diferença entre dois instantes, em segundos inteiros (regra 5). */
export function diferencaEmSegundos(inicio: string | Date, fim: string | Date): number {
  const a = typeof inicio === "string" ? new Date(inicio) : inicio;
  const b = typeof fim === "string" ? new Date(fim) : fim;
  return Math.max(0, Math.floor((b.getTime() - a.getTime()) / 1000));
}

export function formatarData(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR");
}

export function formatarHora(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatarDataHora(iso: string): string {
  return `${formatarData(iso)} ${formatarHora(iso)}`;
}

/** Data local (YYYY-MM-DD) de um instante, para comparar com o filtro de data. */
export function dataLocalISO(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * Converte um intervalo de datas (YYYY-MM-DD, fuso local do navegador) nos
 * instantes que delimitam a consulta: [de, ate). Assim o "dia" filtrado e o
 * dia local do usuario, e nao o do servidor.
 */
export function limitesLocais(
  dataInicio?: string,
  dataFim?: string
): { deISO?: string; ateISO?: string } {
  const limites: { deISO?: string; ateISO?: string } = {};

  if (dataInicio) {
    const [a, m, d] = dataInicio.split("-").map(Number);
    limites.deISO = new Date(a, m - 1, d, 0, 0, 0, 0).toISOString();
  }
  if (dataFim) {
    const [a, m, d] = dataFim.split("-").map(Number);
    limites.ateISO = new Date(a, m - 1, d + 1, 0, 0, 0, 0).toISOString();
  }
  return limites;
}

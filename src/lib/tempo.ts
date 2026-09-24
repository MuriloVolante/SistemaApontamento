/**
 * Formata uma duração em segundos como `00h 00m 00s`.
 *
 * Só a apresentação muda: todo o cálculo continua em segundos inteiros, e as
 * horas de início e fim seguem no formato de relógio (`formatarHora`).
 */
export function formatarDuracao(segundosTotais: number): string {
  const s = Math.max(0, Math.floor(segundosTotais));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const doisDigitos = (n: number) => String(n).padStart(2, "0");
  return `${doisDigitos(h)}h ${doisDigitos(m)}m ${doisDigitos(seg)}s`;
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

/**
 * Segundos decorridos desde a meia-noite local. Serve para ordenar as colunas
 * de hora pelo que elas mostram (HH:MM:SS), e não pela data por tras delas.
 */
export function segundosDoDia(iso: string): number {
  const d = new Date(iso);
  return d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
}

/**
 * Duração compacta, para onde a tela é estreita: omite as unidades à
 * esquerda que estão zeradas. `02h 05m`, `06m 47s`, `32s`.
 *
 * Não substitui `formatarDuracao`: a tabela e os PDFs continuam com o
 * formato completo, onde as durações precisam alinhar em coluna.
 */
export function formatarDuracaoCurta(segundosTotais: number): string {
  const s = Math.max(0, Math.floor(segundosTotais));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const seg = s % 60;
  const dd = (n: number) => String(n).padStart(2, "0");

  if (h > 0) return `${dd(h)}h ${dd(m)}m`;
  if (m > 0) return `${dd(m)}m ${dd(seg)}s`;
  return `${dd(seg)}s`;
}

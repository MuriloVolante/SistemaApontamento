export type Tipo = "OPERACAO" | "PAUSA";
export type Status = "EM_ANDAMENTO" | "PAUSADO";

export interface Etapa {
  id: string;
  nome: string;
  ativa: boolean;
}

export interface Sessao {
  etapa_id: string;
  numero_os: string;
  status: Status;
  segmento_inicio: string;
  motivo: string | null;
}

export interface Apontamento {
  id: string;
  etapa_id: string;
  numero_os: string;
  tipo: Tipo;
  inicio: string;
  fim: string;
  duracao_segundos: number;
  justificativa: string | null;
}

/** Linha da tabela do painel: apontamento + nome da etapa. */
export interface LinhaApontamento extends Apontamento {
  etapa_nome: string;
}

export interface Filtros {
  os: string;
  etapaId: string;
  tipo: "" | Tipo;
  data: string;
}

export interface Totais {
  total: number;
  operacao: number;
  pausa: number;
}

export interface EstadoEtapa {
  etapa: Etapa | null;
  sessao: Sessao | null;
  /** Relógio do servidor no momento da resposta (ISO). */
  agora: string;
}

export interface LinhaSintetico {
  etapa_nome: string;
  total: number;
  operacao: number;
  pausa: number;
}

export type Resultado<T = null> =
  | { ok: true; dados: T }
  | { ok: false; erro: string };

/**
 * Filtros do painel. As bordas de data chegam já convertidas em instantes
 * (ISO) pelo navegador, para que o dia filtrado seja o dia local do usuário
 * e não o do servidor.
 */
export interface FiltroConsulta {
  os?: string;
  etapaId?: string;
  tipo?: "" | Tipo;
  deISO?: string;
  ateISO?: string;
}

export interface ResultadoConsulta {
  linhas: LinhaApontamento[];
  totais: Totais;
}

/** Linha de `sessoes` enriquecida com o nome da etapa, para o dashboard. */
export interface SessaoAtiva extends Sessao {
  etapa_nome: string;
}

export interface PainelAtivo {
  sessoes: SessaoAtiva[];
  /** Relógio do servidor, para o navegador corrigir o próprio. */
  agora: string;
}

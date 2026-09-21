import type {
  Apontamento,
  Etapa,
  FiltroConsulta,
  LinhaApontamento,
  Sessao,
  SessaoAtiva,
  Status,
} from "./tipos";

/** Violação de chave única (nome de etapa repetido, sessão duplicada na etapa). */
export class ErroUnicidade extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroUnicidade";
  }
}

export interface AlteracaoSessao {
  status: Status;
  segmento_inicio: string;
  motivo: string | null;
}

/**
 * Camada de dados. Duas implementações: SQLite local (padrão, arquivo no
 * próprio computador) e Supabase (usada apenas se as variáveis de ambiente
 * estiverem preenchidas). As duas gravam exatamente o mesmo esquema.
 */
export interface Repositorio {
  listarEtapas(apenasAtivas: boolean): Promise<Etapa[]>;
  obterEtapa(id: string): Promise<Etapa | null>;
  criarEtapa(nome: string): Promise<Etapa>;
  renomearEtapa(id: string, nome: string): Promise<void>;
  definirAtivaEtapa(id: string, ativa: boolean): Promise<void>;
  excluirEtapa(id: string): Promise<void>;
  contarApontamentosDaEtapa(id: string): Promise<number>;

  obterSessao(etapaId: string): Promise<Sessao | null>;
  /** Todas as sessoes em curso, com o nome da etapa (dashboard). */
  listarSessoesAtivas(): Promise<SessaoAtiva[]>;
  criarSessao(sessao: Sessao): Promise<void>;
  alterarSessao(etapaId: string, alteracao: AlteracaoSessao): Promise<void>;
  excluirSessao(etapaId: string): Promise<void>;

  inserirApontamento(apontamento: Omit<Apontamento, "id" | "numero">): Promise<void>;
  /** Total de apontamentos gravados. Como só há inserção, serve de número de
   *  revisão barato para detectar mudanças sem reler a tabela inteira. */
  contarApontamentos(): Promise<number>;
  consultarApontamentos(filtro: FiltroConsulta): Promise<LinhaApontamento[]>;
}

/** Só usa Supabase quando as duas variáveis estiverem preenchidas. */
export function usandoSupabase(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()
  );
}

let instancia: Repositorio | null = null;

export async function repositorio(): Promise<Repositorio> {
  if (instancia) return instancia;

  if (usandoSupabase()) {
    const { RepositorioSupabase } = await import("./repo-supabase");
    instancia = new RepositorioSupabase();
  } else {
    const { RepositorioSqlite } = await import("./repo-sqlite");
    instancia = new RepositorioSqlite();
  }
  return instancia;
}

/**
 * Instante atual, truncado ao segundo. Todos os timestamps gravados usam esta
 * função: o fim de um segmento é exatamente o início do seguinte (sem lacuna,
 * regra 2) e as durações fecham em segundos inteiros.
 */
export function agora(): Date {
  const d = new Date();
  d.setMilliseconds(0);
  return d;
}

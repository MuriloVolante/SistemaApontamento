import type {
  Etapa,
  FiltroConsulta,
  LinhaApontamento,
  Sessao,
  SessaoAtiva,
  Status,
  TipoAcesso,
  Usuario,
  UsuarioComSenha,
} from "./tipos";

/** Violação de chave única (nome de etapa repetido, sessão duplicada na etapa). */
export class ErroUnicidade extends Error {
  constructor(mensagem: string) {
    super(mensagem);
    this.name = "ErroUnicidade";
  }
}

/**
 * Estado em que a sessao fica depois de fechar o segmento aberto. Note que
 * nao tem `segmento_inicio`: o inicio do proximo segmento e sempre o fim do
 * anterior, e quem decide isso e o repositorio. Assim nao existe caminho no
 * codigo capaz de abrir uma lacuna entre segmentos (regra 2).
 */
export interface ProximoSegmento {
  status: Status;
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

  /**
   * Fecha o segmento aberto, gravando-o como apontamento, e no mesmo movimento
   * abre o seguinte -- ou encerra a sessao, quando `proximo` e nulo.
   *
   * As duas escritas acontecem numa unica transacao, com a linha da sessao
   * travada. Em duas chamadas separadas, uma queda no meio deixaria o
   * apontamento gravado e a sessao no estado antigo, e um duplo clique
   * gravaria o mesmo segmento duas vezes.
   *
   * Devolve `false` quando a sessao nao esta mais em `statusEsperado` -- outra
   * aba chegou primeiro. Nesse caso nada foi escrito.
   */
  avancarSegmento(
    etapaId: string,
    statusEsperado: Status,
    fimISO: string,
    proximo: ProximoSegmento | null
  ): Promise<boolean>;

  /** Total de apontamentos gravados. Como só há inserção, serve de número de
   *  revisão barato para detectar mudanças sem reler a tabela inteira. */
  contarApontamentos(): Promise<number>;
  consultarApontamentos(filtro: FiltroConsulta): Promise<LinhaApontamento[]>;

  // ---- usuários do painel ------------------------------------------------

  listarUsuarios(): Promise<Usuario[]>;
  obterUsuario(id: string): Promise<Usuario | null>;
  /** Só este devolve o hash da senha; é usado apenas na conferência do login. */
  obterUsuarioPorNome(nome: string): Promise<UsuarioComSenha | null>;
  criarUsuario(nome: string, tipo: TipoAcesso, senhaHash: string): Promise<Usuario>;
  renomearUsuario(id: string, nome: string): Promise<void>;
  definirTipoUsuario(id: string, tipo: TipoAcesso): Promise<void>;
  definirAtivoUsuario(id: string, ativo: boolean): Promise<void>;
  /** Troca a senha e diz se ela volta a ser provisória (reset) ou não (troca). */
  definirSenhaUsuario(id: string, senhaHash: string, primeiroLogin: boolean): Promise<void>;
  excluirUsuario(id: string): Promise<void>;

  // ---- configuração do próprio sistema -----------------------------------

  obterConfiguracao(chave: string): Promise<string | null>;
  /** Grava só se ainda não houver valor, e devolve o que ficou valendo. */
  fixarConfiguracao(chave: string, valor: string): Promise<string>;
}

/**
 * Só usa Supabase quando as duas variáveis do servidor estiverem preenchidas.
 *
 * Sem prefixo `NEXT_PUBLIC_` de propósito: o que leva esse prefixo é embutido
 * no pacote que vai para o navegador, e a chave de acesso ao banco não pode
 * sair do servidor. Ninguém no navegador fala com o Supabase, todo o acesso
 * passa pelas Server Actions.
 */
export function usandoSupabase(): boolean {
  return Boolean(
    process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

/**
 * Nomes usados até a versão anterior. Se sobraram na configuração, é quase
 * certo que a intenção era usar Supabase, e cair calado no SQLite local
 * significaria gravar produção num arquivo que ninguém vai olhar.
 */
function avisarVariaveisAntigas(): void {
  if (process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()) {
    throw new Error(
      "As variáveis NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY não são mais " +
        "usadas: renomeie para SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY (chave service_role, " +
        "sem NEXT_PUBLIC_, para não ir ao navegador)."
    );
  }
}

let instancia: Repositorio | null = null;

export async function repositorio(): Promise<Repositorio> {
  if (instancia) return instancia;

  if (usandoSupabase()) {
    const { RepositorioSupabase } = await import("./repo-supabase");
    instancia = new RepositorioSupabase();
  } else {
    avisarVariaveisAntigas();
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

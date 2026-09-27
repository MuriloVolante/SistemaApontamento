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
 * Estado em que a sessão fica depois de fechar o segmento aberto. Note que
 * não tem `segmento_inicio`: o início do próximo segmento é sempre o fim do
 * anterior, e quem decide isso é o repositório. Assim não existe caminho no
 * código capaz de abrir uma lacuna entre segmentos (regra 2).
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
  /** Todas as sessões em curso, com o nome da etapa (dashboard). */
  listarSessoesAtivas(): Promise<SessaoAtiva[]>;
  criarSessao(sessao: Sessao): Promise<void>;

  /**
   * Fecha o segmento aberto, gravando-o como apontamento, e no mesmo movimento
   * abre o seguinte, ou encerra a sessão quando `proximo` é nulo.
   *
   * As duas escritas acontecem numa única transação, com a linha da sessão
   * travada. Em duas chamadas separadas, uma queda no meio deixaria o
   * apontamento gravado e a sessão no estado antigo, e um duplo clique
   * gravaria o mesmo segmento duas vezes.
   *
   * Devolve `false` quando a sessão não está mais em `statusEsperado`, porque
   * outra aba chegou primeiro. Nesse caso nada foi escrito.
   */
  avancarSegmento(
    etapaId: string,
    statusEsperado: Status,
    fimISO: string,
    proximo: ProximoSegmento | null
  ): Promise<boolean>;

  /**
   * Maior `numero` gravado, ou 0. Como apontamento só é inserido, nunca
   * alterado nem apagado, ele muda exatamente quando há registro novo. Sai do
   * índice de `numero`, sem contar a tabela.
   */
  revisaoApontamentos(): Promise<number>;
  consultarApontamentos(filtro: FiltroConsulta): Promise<LinhaApontamento[]>;
  /** Esta OS já tem algum apontamento nesta etapa? Para o aviso de repetição. */
  existeApontamento(etapaId: string, numeroOs: string): Promise<boolean>;

  // ---- usuários do painel ------------------------------------------------

  contarUsuarios(): Promise<number>;
  listarUsuarios(): Promise<Usuario[]>;
  obterUsuario(id: string): Promise<Usuario | null>;
  /** Só este devolve o hash da senha; é usado apenas na conferência do login. */
  obterUsuarioPorNome(nome: string): Promise<UsuarioComSenha | null>;
  criarUsuario(nome: string, tipo: TipoAcesso, senhaHash: string): Promise<Usuario>;
  renomearUsuario(id: string, nome: string): Promise<void>;
  definirTipoUsuario(id: string, tipo: TipoAcesso): Promise<void>;
  /** Também troca a `versao_sessao`: inativar derruba as sessões abertas. */
  definirAtivoUsuario(id: string, ativo: boolean): Promise<void>;
  /**
   * Troca a senha e diz se ela volta a ser provisória (reset) ou não (troca).
   * Também troca a `versao_sessao`: toda sessão aberta com a senha antiga cai.
   */
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

async function criar(): Promise<Repositorio> {
  if (usandoSupabase()) {
    const { RepositorioSupabase } = await import("./repo-supabase");
    return new RepositorioSupabase();
  }
  const { RepositorioSqlite } = await import("./repo-sqlite");
  return new RepositorioSqlite();
}

/**
 * Guarda a promessa, não a instância: entre o `import()` e a atribuição há um
 * `await`, e duas requisições chegando juntas criariam duas conexões e
 * rodariam a migração duas vezes. Com a promessa guardada logo na primeira
 * chamada, a segunda espera a mesma.
 */
let instancia: Promise<Repositorio> | null = null;

export function repositorio(): Promise<Repositorio> {
  instancia ??= criar();
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

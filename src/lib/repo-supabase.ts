import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { chaveDeNome } from "./nomes";
import { ErroUnicidade } from "./repositorio";
import type { ProximoSegmento, Repositorio } from "./repositorio";
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

/**
 * Implementação para Supabase/Postgres, usada apenas quando SUPABASE_URL e
 * SUPABASE_SERVICE_ROLE_KEY estão preenchidas.
 *
 * Esta classe só existe no servidor: é carregada por `import()` dentro de
 * Server Actions e a chave nunca entra no pacote do navegador. As tabelas têm
 * RLS ligada e nenhuma política, de modo que o papel anônimo, cuja chave
 * qualquer visitante teria, não lê nem grava nada pela API REST.
 */
interface RegistroBruto {
  id: string;
  numero: number;
  etapa_id: string;
  numero_os: string;
  tipo: "OPERACAO" | "PAUSA";
  inicio: string;
  fim: string;
  duracao_segundos: number;
  justificativa: string | null;
  etapas: { nome: string } | { nome: string }[] | null;
}

const CODIGO_UNICIDADE = "23505";

/** Colunas do usuário que podem circular; `senha_hash` nunca está entre elas. */
const CAMPOS_USUARIO = "id, nome, tipo, ativo, primeiro_login, versao_sessao";

const CAMPOS_APONTAMENTO =
  "id, numero, etapa_id, numero_os, tipo, inicio, fim, duracao_segundos, justificativa, etapas(nome)";

/**
 * Quantas linhas pedir por requisição. A API REST do Supabase corta a resposta
 * em 1000 linhas por padrão e não avisa: sem paginar, passado esse volume os
 * totais e os relatórios simplesmente sairiam menores, sem erro nenhum.
 */
const PAGINA = 1000;

function nomeEtapa(reg: RegistroBruto): string {
  const e = reg.etapas;
  if (!e) return "";
  return Array.isArray(e) ? e[0]?.nome ?? "" : e.nome;
}

export class RepositorioSupabase implements Repositorio {
  private db: SupabaseClient;

  constructor() {
    const url = process.env.SUPABASE_URL!;
    const chave = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    this.db = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // ---- etapas -----------------------------------------------------------

  async listarEtapas(apenasAtivas: boolean): Promise<Etapa[]> {
    let q = this.db.from("etapas").select("id, nome, ativa").order("nome");
    if (apenasAtivas) q = q.eq("ativa", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Etapa[];
  }

  async obterEtapa(id: string): Promise<Etapa | null> {
    const { data, error } = await this.db
      .from("etapas")
      .select("id, nome, ativa")
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Etapa) ?? null;
  }

  async criarEtapa(nome: string): Promise<Etapa> {
    const { data, error } = await this.db
      .from("etapas")
      .insert({ nome, nome_chave: chaveDeNome(nome), ativa: true })
      .select("id, nome, ativa")
      .single();
    if (error) {
      if (error.code === CODIGO_UNICIDADE) throw new ErroUnicidade("nome de etapa repetido");
      throw new Error(error.message);
    }
    return data as Etapa;
  }

  async renomearEtapa(id: string, nome: string): Promise<void> {
    const { error } = await this.db
      .from("etapas")
      .update({ nome, nome_chave: chaveDeNome(nome) })
      .eq("id", id);
    if (error) {
      if (error.code === CODIGO_UNICIDADE) throw new ErroUnicidade("nome de etapa repetido");
      throw new Error(error.message);
    }
  }

  async definirAtivaEtapa(id: string, ativa: boolean): Promise<void> {
    const { error } = await this.db.from("etapas").update({ ativa }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async excluirEtapa(id: string): Promise<void> {
    const { error } = await this.db.from("etapas").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  async contarApontamentosDaEtapa(id: string): Promise<number> {
    const { count, error } = await this.db
      .from("apontamentos")
      .select("id", { count: "exact", head: true })
      .eq("etapa_id", id);
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  // ---- sessões ----------------------------------------------------------

  async obterSessao(etapaId: string): Promise<Sessao | null> {
    const { data, error } = await this.db
      .from("sessoes")
      .select("*")
      .eq("etapa_id", etapaId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Sessao) ?? null;
  }

  async listarSessoesAtivas(): Promise<SessaoAtiva[]> {
    const { data, error } = await this.db
      .from("sessoes")
      .select("etapa_id, numero_os, status, segmento_inicio, motivo, etapas(nome)")
      .order("segmento_inicio", { ascending: true });
    if (error) throw new Error(error.message);

    type Bruto = Omit<SessaoAtiva, "etapa_nome"> & {
      etapas: { nome: string } | { nome: string }[] | null;
    };

    return ((data ?? []) as unknown as Bruto[]).map((s) => {
      const { etapas, ...resto } = s;
      const nome = Array.isArray(etapas) ? etapas[0]?.nome ?? "" : etapas?.nome ?? "";
      return { ...resto, etapa_nome: nome };
    });
  }

  async criarSessao(sessao: Sessao): Promise<void> {
    const { error } = await this.db.from("sessoes").insert(sessao);
    if (error) {
      if (error.code === CODIGO_UNICIDADE) {
        throw new ErroUnicidade("já existe sessão para esta etapa");
      }
      throw new Error(error.message);
    }
  }

  /**
   * Fecha o segmento aberto e abre o seguinte, ou encerra a sessão quando
   * `proximo` é nulo.
   *
   * Uma chamada só, para uma função Postgres que trava a linha da sessão
   * (`for update`) e faz as duas escritas na mesma transação. Em duas chamadas
   * separadas, uma queda de rede no meio deixaria o apontamento gravado com a
   * sessão no estado antigo, e um duplo clique gravaria o segmento duas vezes.
   */
  async avancarSegmento(
    etapaId: string,
    statusEsperado: Status,
    fimISO: string,
    proximo: ProximoSegmento | null
  ): Promise<boolean> {
    const { data, error } = await this.db.rpc("avancar_segmento", {
      p_etapa_id: etapaId,
      p_status_esperado: statusEsperado,
      p_fim: fimISO,
      // Nulo significa finalizar: grava o último segmento e libera a etapa.
      p_novo_status: proximo?.status ?? null,
      p_novo_motivo: proximo?.motivo ?? null,
    });
    if (error) throw new Error(error.message);
    return data === true;
  }

  // ---- apontamentos -----------------------------------------------------

  async revisaoApontamentos(): Promise<number> {
    // Maior número pelo índice, em vez de `count: exact`, que conta a tabela
    // inteira e ficaria mais caro a cada apontamento, uma vez por segundo.
    const { data, error } = await this.db
      .from("apontamentos")
      .select("numero")
      .order("numero", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { numero: number } | null)?.numero ?? 0;
  }

  async existeApontamento(etapaId: string, numeroOs: string): Promise<boolean> {
    const { data, error } = await this.db
      .from("apontamentos")
      .select("id")
      .eq("etapa_id", etapaId)
      .eq("numero_os", numeroOs)
      .limit(1);
    if (error) throw new Error(error.message);
    return (data ?? []).length > 0;
  }

  /**
   * Monta a consulta filtrada. Separado porque a paginação a repete.
   *
   * Ordena por `inicio` e desempata por `numero`: várias etapas costumam ter o
   * mesmo início, porque o tempo é truncado ao segundo, e paginar sobre uma
   * ordem que muda entre uma página e outra duplica umas linhas e pula outras.
   * A contagem vai só na primeira página, que é a única que a usa.
   */
  private filtrar(f: FiltroConsulta, contar: boolean) {
    let q = this.db
      .from("apontamentos")
      .select(CAMPOS_APONTAMENTO, contar ? { count: "exact" } : undefined)
      .order("inicio", { ascending: true })
      .order("numero", { ascending: true });

    if (f.os?.trim()) q = q.ilike("numero_os", `%${escaparCuringas(f.os.trim())}%`);
    if (f.osExata?.trim()) q = q.eq("numero_os", f.osExata.trim());
    if (f.etapaId) q = q.eq("etapa_id", f.etapaId);
    if (f.tipo) q = q.eq("tipo", f.tipo);
    if (f.deISO) q = q.gte("inicio", f.deISO);
    if (f.ateISO) q = q.lt("inicio", f.ateISO);

    return q;
  }

  async consultarApontamentos(f: FiltroConsulta): Promise<LinhaApontamento[]> {
    const brutos: RegistroBruto[] = [];
    let total = Infinity;
    // Quanto a API devolve de fato por vez. O projeto pode ter um teto menor
    // que o nosso pedido, e é a primeira resposta que revela qual é.
    let passo = PAGINA;

    while (brutos.length < total) {
      const primeira = brutos.length === 0;
      const { data, error, count } = await this.filtrar(f, primeira).range(
        brutos.length,
        brutos.length + passo - 1
      );
      if (error) throw new Error(error.message);

      const pagina = (data ?? []) as unknown as RegistroBruto[];
      if (pagina.length === 0) break;

      // `count` é o tamanho do resultado inteiro, não o da página.
      if (primeira && count !== null) total = count;
      passo = Math.min(passo, pagina.length);
      brutos.push(...pagina);
    }

    return brutos.map((r) => ({
      id: r.id,
      numero: r.numero,
      etapa_id: r.etapa_id,
      numero_os: r.numero_os,
      tipo: r.tipo,
      inicio: r.inicio,
      fim: r.fim,
      duracao_segundos: r.duracao_segundos,
      justificativa: r.justificativa,
      etapa_nome: nomeEtapa(r),
    }));
  }

  // ---- usuários do painel ------------------------------------------------

  async contarUsuarios(): Promise<number> {
    const { count, error } = await this.db
      .from("usuarios")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async listarUsuarios(): Promise<Usuario[]> {
    const { data, error } = await this.db
      .from("usuarios")
      .select(CAMPOS_USUARIO)
      .order("nome_chave");
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as Usuario[];
  }

  async obterUsuario(id: string): Promise<Usuario | null> {
    const { data, error } = await this.db
      .from("usuarios")
      .select(CAMPOS_USUARIO)
      .eq("id", id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as Usuario) ?? null;
  }

  async obterUsuarioPorNome(nome: string): Promise<UsuarioComSenha | null> {
    // Igualdade exata na chave. O `ilike` de antes tratava `%` e `_` como
    // curinga: "joao_silva" casava com "joaoXsilva", e um `%` com mais de um
    // usuário cadastrado fazia o `maybeSingle` estourar com o texto do banco.
    const { data, error } = await this.db
      .from("usuarios")
      .select(`${CAMPOS_USUARIO}, senha_hash`)
      .eq("nome_chave", chaveDeNome(nome))
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as unknown as UsuarioComSenha) ?? null;
  }

  async criarUsuario(nome: string, tipo: TipoAcesso, senhaHash: string): Promise<Usuario> {
    const { data, error } = await this.db
      .from("usuarios")
      .insert({
        nome,
        nome_chave: chaveDeNome(nome),
        tipo,
        ativo: true,
        senha_hash: senhaHash,
        primeiro_login: true,
      })
      .select(CAMPOS_USUARIO)
      .single();
    if (error) {
      if (error.code === CODIGO_UNICIDADE) throw new ErroUnicidade("nome de usuário repetido");
      throw new Error(error.message);
    }
    return data as unknown as Usuario;
  }

  async renomearUsuario(id: string, nome: string): Promise<void> {
    const { error } = await this.db
      .from("usuarios")
      .update({ nome, nome_chave: chaveDeNome(nome) })
      .eq("id", id);
    if (error) {
      if (error.code === CODIGO_UNICIDADE) throw new ErroUnicidade("nome de usuário repetido");
      throw new Error(error.message);
    }
  }

  async definirTipoUsuario(id: string, tipo: TipoAcesso): Promise<void> {
    const { error } = await this.db.from("usuarios").update({ tipo }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  // A `versao_sessao` sobe sozinha: um gatilho no banco a incrementa sempre
  // que `ativo` ou `senha_hash` mudam (ver schema.sql). A API REST não sabe
  // escrever `versao_sessao = versao_sessao + 1`, e ler para depois gravar
  // deixaria duas revogações simultâneas valerem por uma.

  async definirAtivoUsuario(id: string, ativo: boolean): Promise<void> {
    const { error } = await this.db.from("usuarios").update({ ativo }).eq("id", id);
    if (error) throw new Error(error.message);
  }

  async definirSenhaUsuario(id: string, senhaHash: string, primeiroLogin: boolean): Promise<void> {
    const { error } = await this.db
      .from("usuarios")
      .update({ senha_hash: senhaHash, primeiro_login: primeiroLogin })
      .eq("id", id);
    if (error) throw new Error(error.message);
  }

  async excluirUsuario(id: string): Promise<void> {
    const { error } = await this.db.from("usuarios").delete().eq("id", id);
    if (error) throw new Error(error.message);
  }

  // ---- configuração do próprio sistema -----------------------------------

  async obterConfiguracao(chave: string): Promise<string | null> {
    const { data, error } = await this.db
      .from("configuracao")
      .select("valor")
      .eq("chave", chave)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return (data as { valor: string } | null)?.valor ?? null;
  }

  async fixarConfiguracao(chave: string, valor: string): Promise<string> {
    // `ignoreDuplicates` mantém o valor que já estava; a releitura logo abaixo
    // devolve o que de fato ficou valendo, não o que tentamos gravar.
    const { error } = await this.db
      .from("configuracao")
      .upsert({ chave, valor }, { onConflict: "chave", ignoreDuplicates: true });
    if (error) throw new Error(error.message);

    const efetivo = await this.obterConfiguracao(chave);
    if (!efetivo) throw new Error(`Não foi possível gravar a configuração ${chave}.`);
    return efetivo;
  }
}

/** A busca parcial de OS não pode deixar `%` e `_` digitados virarem curinga. */
function escaparCuringas(texto: string): string {
  return texto.replace(/[\\%_]/g, "\\$&");
}

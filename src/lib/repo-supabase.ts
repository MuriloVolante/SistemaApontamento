import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { ErroUnicidade } from "./repositorio";
import type { AlteracaoSessao, Repositorio } from "./repositorio";
import type {
  Apontamento,
  Etapa,
  FiltroConsulta,
  LinhaApontamento,
  Sessao,
  SessaoAtiva,
} from "./tipos";

/**
 * Implementação para Supabase/Postgres, usada apenas quando
 * NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY estão preenchidas.
 * Sem autenticação: as tabelas têm RLS liberada para o papel anônimo.
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

function nomeEtapa(reg: RegistroBruto): string {
  const e = reg.etapas;
  if (!e) return "";
  return Array.isArray(e) ? e[0]?.nome ?? "" : e.nome;
}

export class RepositorioSupabase implements Repositorio {
  private db: SupabaseClient;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const chave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    this.db = createClient(url, chave, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  // ---- etapas -----------------------------------------------------------

  async listarEtapas(apenasAtivas: boolean): Promise<Etapa[]> {
    let q = this.db.from("etapas").select("*").order("nome");
    if (apenasAtivas) q = q.eq("ativa", true);
    const { data, error } = await q;
    if (error) throw new Error(error.message);
    return (data ?? []) as Etapa[];
  }

  async obterEtapa(id: string): Promise<Etapa | null> {
    const { data, error } = await this.db.from("etapas").select("*").eq("id", id).maybeSingle();
    if (error) throw new Error(error.message);
    return (data as Etapa) ?? null;
  }

  async criarEtapa(nome: string): Promise<Etapa> {
    const { data, error } = await this.db
      .from("etapas")
      .insert({ nome, ativa: true })
      .select()
      .single();
    if (error) {
      if (error.code === CODIGO_UNICIDADE) throw new ErroUnicidade("nome de etapa repetido");
      throw new Error(error.message);
    }
    return data as Etapa;
  }

  async renomearEtapa(id: string, nome: string): Promise<void> {
    const { error } = await this.db.from("etapas").update({ nome }).eq("id", id);
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

  async alterarSessao(etapaId: string, a: AlteracaoSessao): Promise<void> {
    const { error } = await this.db.from("sessoes").update(a).eq("etapa_id", etapaId);
    if (error) throw new Error(error.message);
  }

  async excluirSessao(etapaId: string): Promise<void> {
    const { error } = await this.db.from("sessoes").delete().eq("etapa_id", etapaId);
    if (error) throw new Error(error.message);
  }

  // ---- apontamentos -----------------------------------------------------

  async inserirApontamento(a: Omit<Apontamento, "id" | "numero">): Promise<void> {
    const { error } = await this.db.from("apontamentos").insert(a);
    if (error) throw new Error(error.message);
  }

  async contarApontamentos(): Promise<number> {
    const { count, error } = await this.db
      .from("apontamentos")
      .select("id", { count: "exact", head: true });
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  async consultarApontamentos(f: FiltroConsulta): Promise<LinhaApontamento[]> {
    let q = this.db
      .from("apontamentos")
      .select(
        "id, numero, etapa_id, numero_os, tipo, inicio, fim, duracao_segundos, justificativa, etapas(nome)"
      )
      .order("inicio", { ascending: true });

    if (f.os?.trim()) q = q.ilike("numero_os", `%${f.os.trim()}%`);
    if (f.etapaId) q = q.eq("etapa_id", f.etapaId);
    if (f.tipo) q = q.eq("tipo", f.tipo);
    if (f.deISO) q = q.gte("inicio", f.deISO);
    if (f.ateISO) q = q.lt("inicio", f.ateISO);

    const { data, error } = await q;
    if (error) throw new Error(error.message);

    return ((data ?? []) as unknown as RegistroBruto[]).map((r) => ({
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
}

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ErroUnicidade } from "./repositorio";
import type { AlteracaoSessao, Repositorio } from "./repositorio";
import type {
  Apontamento,
  Etapa,
  FiltroConsulta,
  LinhaApontamento,
  Sessao,
  Status,
  Tipo,
} from "./tipos";

/**
 * Banco local em arquivo (SQLite). Não exige instalar nem configurar nada:
 * o arquivo é criado na primeira execução em `dados/apontamento.db`.
 */
const ESQUEMA = `
create table if not exists etapas (
  id    text primary key,
  nome  text not null unique,
  ativa integer not null default 1
);

create table if not exists apontamentos (
  id               text primary key,
  etapa_id         text not null references etapas(id),
  numero_os        text not null,
  tipo             text not null check (tipo in ('OPERACAO','PAUSA')),
  inicio           text not null,
  fim              text not null,
  duracao_segundos integer not null,
  justificativa    text
);

create table if not exists sessoes (
  etapa_id        text primary key references etapas(id),
  numero_os       text not null,
  status          text not null check (status in ('EM_ANDAMENTO','PAUSADO')),
  segmento_inicio text not null,
  motivo          text
);

create index if not exists apontamentos_numero_os_idx on apontamentos (numero_os);
create index if not exists apontamentos_inicio_idx    on apontamentos (inicio);
`;

const ETAPAS_INICIAIS = ["Impressão", "Corte", "Acabamento"];

interface EtapaBruta {
  id: string;
  nome: string;
  ativa: number;
}

interface LinhaBruta {
  id: string;
  etapa_id: string;
  numero_os: string;
  tipo: Tipo;
  inicio: string;
  fim: string;
  duracao_segundos: number;
  justificativa: string | null;
  etapa_nome: string;
}

function caminhoBanco(): string {
  const configurado = process.env.APONTAMENTO_DB?.trim();
  if (configurado) return path.resolve(configurado);
  return path.join(process.cwd(), "dados", "apontamento.db");
}

function ehViolacaoUnica(e: unknown): boolean {
  const codigo = (e as { code?: string }).code ?? "";
  return codigo.startsWith("SQLITE_CONSTRAINT");
}

export class RepositorioSqlite implements Repositorio {
  private db: Database.Database;

  constructor() {
    const arquivo = caminhoBanco();
    fs.mkdirSync(path.dirname(arquivo), { recursive: true });

    this.db = new Database(arquivo);
    this.db.pragma("journal_mode = WAL");
    this.db.pragma("foreign_keys = ON");
    // Duas abas gravando ao mesmo tempo esperam a vez em vez de dar erro.
    this.db.pragma("busy_timeout = 5000");
    this.db.exec(ESQUEMA);
    this.semear();
  }

  /**
   * Na primeira execução, cria etapas de exemplo para haver o que apontar.
   * Em uma transação: se duas requisições chegarem juntas, a segunda espera a
   * primeira terminar e então enxerga a tabela já preenchida.
   */
  private semear(): void {
    const inserir = this.db.prepare(
      "insert or ignore into etapas (id, nome, ativa) values (?, ?, 1)"
    );

    this.db.transaction(() => {
      const { total } = this.db.prepare("select count(*) as total from etapas").get() as {
        total: number;
      };
      if (total > 0) return;
      for (const nome of ETAPAS_INICIAIS) inserir.run(randomUUID(), nome);
    })();
  }

  // ---- etapas -----------------------------------------------------------

  async listarEtapas(apenasAtivas: boolean): Promise<Etapa[]> {
    const sql = apenasAtivas
      ? "select * from etapas where ativa = 1 order by nome"
      : "select * from etapas order by nome";
    return (this.db.prepare(sql).all() as EtapaBruta[]).map((e) => ({
      id: e.id,
      nome: e.nome,
      ativa: e.ativa === 1,
    }));
  }

  async obterEtapa(id: string): Promise<Etapa | null> {
    const e = this.db.prepare("select * from etapas where id = ?").get(id) as
      | EtapaBruta
      | undefined;
    return e ? { id: e.id, nome: e.nome, ativa: e.ativa === 1 } : null;
  }

  async criarEtapa(nome: string): Promise<Etapa> {
    const id = randomUUID();
    try {
      this.db.prepare("insert into etapas (id, nome, ativa) values (?, ?, 1)").run(id, nome);
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de etapa repetido");
      throw e;
    }
    return { id, nome, ativa: true };
  }

  async renomearEtapa(id: string, nome: string): Promise<void> {
    try {
      this.db.prepare("update etapas set nome = ? where id = ?").run(nome, id);
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de etapa repetido");
      throw e;
    }
  }

  async definirAtivaEtapa(id: string, ativa: boolean): Promise<void> {
    this.db.prepare("update etapas set ativa = ? where id = ?").run(ativa ? 1 : 0, id);
  }

  async excluirEtapa(id: string): Promise<void> {
    this.db.prepare("delete from etapas where id = ?").run(id);
  }

  async contarApontamentosDaEtapa(id: string): Promise<number> {
    const { total } = this.db
      .prepare("select count(*) as total from apontamentos where etapa_id = ?")
      .get(id) as { total: number };
    return total;
  }

  // ---- sessões ----------------------------------------------------------

  async obterSessao(etapaId: string): Promise<Sessao | null> {
    const s = this.db.prepare("select * from sessoes where etapa_id = ?").get(etapaId) as
      | (Omit<Sessao, "status"> & { status: Status })
      | undefined;
    return s ?? null;
  }

  async criarSessao(sessao: Sessao): Promise<void> {
    try {
      this.db
        .prepare(
          `insert into sessoes (etapa_id, numero_os, status, segmento_inicio, motivo)
           values (?, ?, ?, ?, ?)`
        )
        .run(
          sessao.etapa_id,
          sessao.numero_os,
          sessao.status,
          sessao.segmento_inicio,
          sessao.motivo
        );
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("já existe sessão para esta etapa");
      throw e;
    }
  }

  async alterarSessao(etapaId: string, a: AlteracaoSessao): Promise<void> {
    this.db
      .prepare(
        "update sessoes set status = ?, segmento_inicio = ?, motivo = ? where etapa_id = ?"
      )
      .run(a.status, a.segmento_inicio, a.motivo, etapaId);
  }

  async excluirSessao(etapaId: string): Promise<void> {
    this.db.prepare("delete from sessoes where etapa_id = ?").run(etapaId);
  }

  // ---- apontamentos -----------------------------------------------------

  async inserirApontamento(a: Omit<Apontamento, "id">): Promise<void> {
    this.db
      .prepare(
        `insert into apontamentos
           (id, etapa_id, numero_os, tipo, inicio, fim, duracao_segundos, justificativa)
         values (?, ?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        randomUUID(),
        a.etapa_id,
        a.numero_os,
        a.tipo,
        a.inicio,
        a.fim,
        a.duracao_segundos,
        a.justificativa
      );
  }

  async consultarApontamentos(f: FiltroConsulta): Promise<LinhaApontamento[]> {
    const condicoes: string[] = [];
    const valores: unknown[] = [];

    // OS: busca parcial, sem cadastro prévio (regra 4).
    if (f.os?.trim()) {
      condicoes.push("a.numero_os like '%' || ? || '%'");
      valores.push(f.os.trim());
    }
    if (f.etapaId) {
      condicoes.push("a.etapa_id = ?");
      valores.push(f.etapaId);
    }
    if (f.tipo) {
      condicoes.push("a.tipo = ?");
      valores.push(f.tipo);
    }
    // Instantes gravados sempre em ISO UTC, então a comparação textual ordena
    // igual à cronológica.
    if (f.deISO) {
      condicoes.push("a.inicio >= ?");
      valores.push(f.deISO);
    }
    if (f.ateISO) {
      condicoes.push("a.inicio < ?");
      valores.push(f.ateISO);
    }

    const onde = condicoes.length ? `where ${condicoes.join(" and ")}` : "";
    const linhas = this.db
      .prepare(
        `select a.*, e.nome as etapa_nome
           from apontamentos a
           join etapas e on e.id = a.etapa_id
           ${onde}
          order by a.inicio asc`
      )
      .all(...valores) as LinhaBruta[];

    return linhas;
  }
}

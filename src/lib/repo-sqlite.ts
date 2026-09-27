import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ErroUnicidade } from "./repositorio";
import { diferencaEmSegundos } from "./tempo";
import type { ProximoSegmento, Repositorio } from "./repositorio";
import type {
  Etapa,
  FiltroConsulta,
  LinhaApontamento,
  Sessao,
  SessaoAtiva,
  Status,
  Tipo,
  TipoAcesso,
  Usuario,
  UsuarioComSenha,
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
  numero           integer,
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

create table if not exists usuarios (
  id             text primary key,
  nome           text not null unique collate nocase,
  tipo           text not null check (tipo in ('GESTOR','VENDEDOR')),
  ativo          integer not null default 1,
  senha_hash     text not null,
  primeiro_login integer not null default 1
);

create table if not exists configuracao (
  chave text primary key,
  valor text not null
);

create index if not exists apontamentos_numero_os_idx on apontamentos (numero_os);
create index if not exists apontamentos_inicio_idx    on apontamentos (inicio);
`;

/**
 * Etapas criadas na primeira execução, quando o banco ainda está vazio: são as
 * máquinas e os setores da gráfica. Depois disso quem manda é o cadastro do
 * painel — esta lista não volta a ser consultada.
 */
const ETAPAS_INICIAIS = [
  "GOSS",
  "Komori",
  "SM",
  "KBA",
  "Dobradeira MBO",
  "Dobradeira AR",
  "Laminacao",
  "Corte/Vinco Automatico",
  "Corte/Vinco Manual",
  "Alceadeira 10 gavetas",
  "Alceadeira 5 gavetas",
  "Alceadeira Torre",
  "Guilhotina 115 Tiger",
  "Guilhotina 115 [revisar]",
  "Guilhotina [revisar]",
  "Verniz Localizado",
  "Grampeador Miruna",
  "Desfoleadeira",
  "Maquina de aplicar vareta",
  "Cartucheira",
  "Maquina de copo 01",
  "Maquina de copo 02",
  "Maquina de copo 03",
  "Maquina de copo 04",
  "Maquina de balde 5L",
  "Coladeira PUR",
  "Shirincadeira Autoamtica",
  "Shirincadeira manual",
  "Expedicao",
  "Ricoh",
];

interface UsuarioBruto {
  id: string;
  nome: string;
  tipo: TipoAcesso;
  ativo: number;
  senha_hash: string;
  primeiro_login: number;
}

/** O SQLite não tem booleano: 0 e 1 viram false e true aqui, e só aqui. */
function comoUsuario(u: UsuarioBruto): Usuario {
  return {
    id: u.id,
    nome: u.nome,
    tipo: u.tipo,
    ativo: Boolean(u.ativo),
    primeiro_login: Boolean(u.primeiro_login),
  };
}

interface EtapaBruta {
  id: string;
  nome: string;
  ativa: number;
}

interface LinhaBruta {
  id: string;
  numero: number;
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
    this.migrar();
    // Depois da migração a coluna existe nos dois caminhos: tabela nova
    // (veio no ESQUEMA) e tabela antiga (acabou de ser acrescentada).
    this.db.exec("create index if not exists apontamentos_numero_idx on apontamentos (numero)");
    this.semear();
  }

  /**
   * Bancos criados antes da coluna `numero` recebem a coluna e são numerados
   * em ordem cronológica. Idempotente: em banco novo, não faz nada.
   */
  private migrar(): void {
    const colunas = this.db.prepare("pragma table_info(apontamentos)").all() as { name: string }[];
    if (colunas.some((c) => c.name === "numero")) return;

    this.db.transaction(() => {
      this.db.exec("alter table apontamentos add column numero integer");
      this.db.exec(`
        update apontamentos set numero = (
          select count(*) from apontamentos anterior
           where anterior.inicio < apontamentos.inicio
              or (anterior.inicio = apontamentos.inicio and anterior.rowid <= apontamentos.rowid)
        )`);
    })();
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

  async listarSessoesAtivas(): Promise<SessaoAtiva[]> {
    return this.db
      .prepare(
        `select s.*, e.nome as etapa_nome
           from sessoes s
           join etapas e on e.id = s.etapa_id
          order by s.segmento_inicio asc`
      )
      .all() as SessaoAtiva[];
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

  /**
   * Fecha o segmento aberto e abre o seguinte -- ou encerra a sessão, quando
   * `proximo` é nulo -- numa transação só.
   *
   * `immediate()` pega a trava de escrita já na abertura: o Next levanta mais
   * de um processo, e dois cliques simultâneos na mesma etapa entram aqui em
   * fila. O segundo relê a sessão, encontra o status já mudado e sai sem
   * gravar nada, em vez de duplicar o segmento.
   */
  async avancarSegmento(
    etapaId: string,
    statusEsperado: Status,
    fimISO: string,
    proximo: ProximoSegmento | null
  ): Promise<boolean> {
    const lerSessao = this.db.prepare("select * from sessoes where etapa_id = ?");
    // O sequencial sai do próprio banco, dentro do mesmo comando: dois
    // apontamentos gravados ao mesmo tempo não disputam o número.
    const gravar = this.db.prepare(
      `insert into apontamentos
         (id, numero, etapa_id, numero_os, tipo, inicio, fim, duracao_segundos, justificativa)
       values (?, (select coalesce(max(numero), 0) + 1 from apontamentos), ?, ?, ?, ?, ?, ?, ?)`
    );
    const atualizar = this.db.prepare(
      "update sessoes set status = ?, segmento_inicio = ?, motivo = ? where etapa_id = ?"
    );
    const apagar = this.db.prepare("delete from sessoes where etapa_id = ?");

    const transacao = this.db.transaction((): boolean => {
      const s = lerSessao.get(etapaId) as Sessao | undefined;
      if (!s || s.status !== statusEsperado) return false;

      const tipo: Tipo = s.status === "EM_ANDAMENTO" ? "OPERACAO" : "PAUSA";
      gravar.run(
        randomUUID(),
        s.etapa_id,
        s.numero_os,
        tipo,
        s.segmento_inicio,
        fimISO,
        diferencaEmSegundos(s.segmento_inicio, fimISO),
        // Justificativa só existe em segmento de pausa.
        tipo === "PAUSA" ? s.motivo : null
      );

      // O próximo segmento começa exatamente onde o anterior terminou.
      if (proximo) atualizar.run(proximo.status, fimISO, proximo.motivo, etapaId);
      else apagar.run(etapaId);

      return true;
    });

    return transacao.immediate();
  }

  // ---- apontamentos -----------------------------------------------------

  async contarApontamentos(): Promise<number> {
    const { total } = this.db.prepare("select count(*) as total from apontamentos").get() as {
      total: number;
    };
    return total;
  }

  async consultarApontamentos(f: FiltroConsulta): Promise<LinhaApontamento[]> {
    const condicoes: string[] = [];
    const valores: unknown[] = [];

    // OS: busca parcial, sem cadastro prévio (regra 4).
    if (f.os?.trim()) {
      condicoes.push("a.numero_os like '%' || ? || '%'");
      valores.push(f.os.trim());
    }
    if (f.osExata?.trim()) {
      condicoes.push("a.numero_os = ?");
      valores.push(f.osExata.trim());
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

  // ---- usuários do painel ------------------------------------------------

  async listarUsuarios(): Promise<Usuario[]> {
    const linhas = this.db
      .prepare("select * from usuarios order by nome collate nocase")
      .all() as UsuarioBruto[];
    return linhas.map(comoUsuario);
  }

  async obterUsuario(id: string): Promise<Usuario | null> {
    const u = this.db.prepare("select * from usuarios where id = ?").get(id) as
      | UsuarioBruto
      | undefined;
    return u ? comoUsuario(u) : null;
  }

  async obterUsuarioPorNome(nome: string): Promise<UsuarioComSenha | null> {
    // `collate nocase` no índice: quem cadastrou "Joao" entra como "joao".
    const u = this.db.prepare("select * from usuarios where nome = ? collate nocase").get(nome) as
      | UsuarioBruto
      | undefined;
    return u ? { ...comoUsuario(u), senha_hash: u.senha_hash } : null;
  }

  async criarUsuario(nome: string, tipo: TipoAcesso, senhaHash: string): Promise<Usuario> {
    const usuario: Usuario = {
      id: randomUUID(),
      nome,
      tipo,
      ativo: true,
      primeiro_login: true,
    };
    try {
      this.db
        .prepare(
          `insert into usuarios (id, nome, tipo, ativo, senha_hash, primeiro_login)
           values (?, ?, ?, 1, ?, 1)`
        )
        .run(usuario.id, nome, tipo, senhaHash);
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de usuário repetido");
      throw e;
    }
    return usuario;
  }

  async renomearUsuario(id: string, nome: string): Promise<void> {
    try {
      this.db.prepare("update usuarios set nome = ? where id = ?").run(nome, id);
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de usuário repetido");
      throw e;
    }
  }

  async definirAtivoUsuario(id: string, ativo: boolean): Promise<void> {
    this.db.prepare("update usuarios set ativo = ? where id = ?").run(ativo ? 1 : 0, id);
  }

  async definirSenhaUsuario(
    id: string,
    senhaHash: string,
    primeiroLogin: boolean
  ): Promise<void> {
    this.db
      .prepare("update usuarios set senha_hash = ?, primeiro_login = ? where id = ?")
      .run(senhaHash, primeiroLogin ? 1 : 0, id);
  }

  async excluirUsuario(id: string): Promise<void> {
    this.db.prepare("delete from usuarios where id = ?").run(id);
  }

  // ---- configuração do próprio sistema -----------------------------------

  async obterConfiguracao(chave: string): Promise<string | null> {
    const linha = this.db.prepare("select valor from configuracao where chave = ?").get(chave) as
      | { valor: string }
      | undefined;
    return linha?.valor ?? null;
  }

  async fixarConfiguracao(chave: string, valor: string): Promise<string> {
    // `insert or ignore` e releitura na mesma transação: se dois processos
    // sortearem uma chave de sessão ao mesmo tempo, os dois saem com a mesma.
    return this.db.transaction((): string => {
      this.db
        .prepare("insert or ignore into configuracao (chave, valor) values (?, ?)")
        .run(chave, valor);
      const linha = this.db.prepare("select valor from configuracao where chave = ?").get(chave) as {
        valor: string;
      };
      return linha.valor;
    }).immediate();
  }
}

import { randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { ETAPAS_INICIAIS } from "./etapas-iniciais";
import { chaveDeNome } from "./nomes";
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
 *
 * Os índices ficam fora daqui e são criados depois de `migrar()`: um banco
 * antigo ainda não tem as colunas novas, e `create table if not exists` não
 * acrescenta coluna em tabela que já existe.
 */
const ESQUEMA = `
create table if not exists etapas (
  id         text primary key,
  nome       text not null unique,
  nome_chave text,
  ativa      integer not null default 1
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
  nome_chave     text,
  tipo           text not null check (tipo in ('GESTOR','VENDEDOR')),
  ativo          integer not null default 1,
  senha_hash     text not null,
  primeiro_login integer not null default 1,
  versao_sessao  integer not null default 0
);

create table if not exists configuracao (
  chave text primary key,
  valor text not null
);
`;

interface UsuarioBruto {
  id: string;
  nome: string;
  tipo: TipoAcesso;
  ativo: number;
  senha_hash: string;
  primeiro_login: number;
  versao_sessao: number;
}

/** O SQLite não tem booleano: 0 e 1 viram false e true aqui, e só aqui. */
function comoUsuario(u: UsuarioBruto): Usuario {
  return {
    id: u.id,
    nome: u.nome,
    tipo: u.tipo,
    ativo: Boolean(u.ativo),
    primeiro_login: Boolean(u.primeiro_login),
    versao_sessao: u.versao_sessao,
  };
}

interface EtapaBruta {
  id: string;
  nome: string;
  ativa: number;
}

function comoEtapa(e: EtapaBruta): Etapa {
  return { id: e.id, nome: e.nome, ativa: e.ativa === 1 };
}

function caminhoBanco(): string {
  const configurado = process.env.APONTAMENTO_DB?.trim();
  if (configurado) return path.resolve(configurado);
  return path.join(process.cwd(), "dados", "apontamento.db");
}

/**
 * Só chave única e chave primária. Um `startsWith("SQLITE_CONSTRAINT")` pegava
 * também chave estrangeira, CHECK e NOT NULL: iniciar numa etapa que não
 * existe respondia "já existe um apontamento em andamento".
 */
function ehViolacaoUnica(e: unknown): boolean {
  const codigo = (e as { code?: string }).code;
  return codigo === "SQLITE_CONSTRAINT_UNIQUE" || codigo === "SQLITE_CONSTRAINT_PRIMARYKEY";
}

export class RepositorioSqlite implements Repositorio {
  private db: Database.Database;

  /** Cada SQL é preparado uma vez só e reaproveitado. */
  private preparados = new Map<string, Database.Statement>();

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
    this.indexar();
    this.semear();
  }

  private sql(texto: string): Database.Statement {
    let s = this.preparados.get(texto);
    if (!s) {
      s = this.db.prepare(texto);
      this.preparados.set(texto, s);
    }
    return s;
  }

  // ---- estrutura --------------------------------------------------------

  private temColuna(tabela: string, coluna: string): boolean {
    const colunas = this.db.prepare(`pragma table_info(${tabela})`).all() as { name: string }[];
    return colunas.some((c) => c.name === coluna);
  }

  /**
   * Leva um banco de qualquer versão anterior ao formato atual. Idempotente:
   * cada passo confere antes de agir, e em banco novo nada acontece.
   */
  private migrar(): void {
    this.db.transaction(() => {
      // `numero`: o "#" da tabela, numerado em ordem cronológica.
      if (!this.temColuna("apontamentos", "numero")) {
        this.db.exec("alter table apontamentos add column numero integer");
        this.db.exec(`
          update apontamentos set numero = (
            select count(*) from apontamentos anterior
             where anterior.inicio < apontamentos.inicio
                or (anterior.inicio = apontamentos.inicio and anterior.rowid <= apontamentos.rowid)
          )`);
      }

      // `versao_sessao`: revogação de sessões ao resetar, trocar ou inativar.
      if (!this.temColuna("usuarios", "versao_sessao")) {
        this.db.exec("alter table usuarios add column versao_sessao integer not null default 0");
      }

      // `nome_chave`: comparação de nomes sem diferença de maiúsculas, com
      // acento. Calculada aqui, em JavaScript, porque o SQLite só sabe
      // minusculizar letras sem acento.
      for (const tabela of ["etapas", "usuarios"]) {
        if (!this.temColuna(tabela, "nome_chave")) {
          this.db.exec(`alter table ${tabela} add column nome_chave text`);
        }
        const pendentes = this.db
          .prepare(`select id, nome from ${tabela} where nome_chave is null`)
          .all() as { id: string; nome: string }[];
        const gravar = this.db.prepare(`update ${tabela} set nome_chave = ? where id = ?`);
        for (const r of pendentes) gravar.run(chaveDeNome(r.nome), r.id);
      }
    })();
  }

  /**
   * Índice único só é criado se os dados permitirem. Um banco antigo com
   * "Corte" e "corte" cadastradas travaria a partida inteira com o erro do
   * índice; assim o sistema sobe, avisa no console e segue sem a trava.
   */
  private indiceUnico(nome: string, tabela: string, coluna: string): void {
    const repetido = this.db
      .prepare(
        `select ${coluna} from ${tabela} where ${coluna} is not null
          group by ${coluna} having count(*) > 1 limit 1`
      )
      .get();
    if (repetido) {
      console.warn(`[banco] ${tabela}.${coluna} tem valores repetidos; índice único ${nome} não criado.`);
      return;
    }
    this.db.exec(`create unique index if not exists ${nome} on ${tabela} (${coluna})`);
  }

  private indexar(): void {
    this.db.exec(`
      create index if not exists apontamentos_numero_os_idx on apontamentos (numero_os);
      create index if not exists apontamentos_inicio_idx    on apontamentos (inicio);
      create index if not exists apontamentos_etapa_idx     on apontamentos (etapa_id, numero_os);
    `);

    // O índice de `numero` era comum; passa a ser único. Dois registros com o
    // mesmo "#" seriam impossíveis de distinguir na tabela.
    this.db.exec("drop index if exists apontamentos_numero_idx");
    this.indiceUnico("apontamentos_numero_unico", "apontamentos", "numero");
    this.indiceUnico("etapas_nome_chave_unico", "etapas", "nome_chave");
    this.indiceUnico("usuarios_nome_chave_unico", "usuarios", "nome_chave");
  }

  /**
   * Na primeira execução, cria as etapas iniciais. Em uma transação: se duas
   * requisições chegarem juntas, a segunda espera a primeira terminar e então
   * enxerga a tabela já preenchida.
   */
  private semear(): void {
    this.db.transaction(() => {
      const { total } = this.sql("select count(*) as total from etapas").get() as { total: number };
      if (total > 0) return;
      const inserir = this.sql(
        "insert or ignore into etapas (id, nome, nome_chave, ativa) values (?, ?, ?, 1)"
      );
      for (const nome of ETAPAS_INICIAIS) inserir.run(randomUUID(), nome, chaveDeNome(nome));
    })();
  }

  // ---- etapas -----------------------------------------------------------

  async listarEtapas(apenasAtivas: boolean): Promise<Etapa[]> {
    const sql = apenasAtivas
      ? "select * from etapas where ativa = 1 order by nome"
      : "select * from etapas order by nome";
    return (this.sql(sql).all() as EtapaBruta[]).map(comoEtapa);
  }

  async obterEtapa(id: string): Promise<Etapa | null> {
    const e = this.sql("select * from etapas where id = ?").get(id) as EtapaBruta | undefined;
    return e ? comoEtapa(e) : null;
  }

  async criarEtapa(nome: string): Promise<Etapa> {
    const id = randomUUID();
    try {
      this.sql("insert into etapas (id, nome, nome_chave, ativa) values (?, ?, ?, 1)").run(
        id,
        nome,
        chaveDeNome(nome)
      );
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de etapa repetido");
      throw e;
    }
    return { id, nome, ativa: true };
  }

  async renomearEtapa(id: string, nome: string): Promise<void> {
    try {
      this.sql("update etapas set nome = ?, nome_chave = ? where id = ?").run(
        nome,
        chaveDeNome(nome),
        id
      );
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de etapa repetido");
      throw e;
    }
  }

  async definirAtivaEtapa(id: string, ativa: boolean): Promise<void> {
    this.sql("update etapas set ativa = ? where id = ?").run(ativa ? 1 : 0, id);
  }

  async excluirEtapa(id: string): Promise<void> {
    this.sql("delete from etapas where id = ?").run(id);
  }

  async contarApontamentosDaEtapa(id: string): Promise<number> {
    const { total } = this.sql("select count(*) as total from apontamentos where etapa_id = ?").get(
      id
    ) as { total: number };
    return total;
  }

  // ---- sessões ----------------------------------------------------------

  async obterSessao(etapaId: string): Promise<Sessao | null> {
    const s = this.sql("select * from sessoes where etapa_id = ?").get(etapaId) as
      | Sessao
      | undefined;
    return s ?? null;
  }

  async listarSessoesAtivas(): Promise<SessaoAtiva[]> {
    return this.sql(
      `select s.*, e.nome as etapa_nome
         from sessoes s
         join etapas e on e.id = s.etapa_id
        order by s.segmento_inicio asc`
    ).all() as SessaoAtiva[];
  }

  async criarSessao(sessao: Sessao): Promise<void> {
    try {
      this.sql(
        `insert into sessoes (etapa_id, numero_os, status, segmento_inicio, motivo)
         values (?, ?, ?, ?, ?)`
      ).run(sessao.etapa_id, sessao.numero_os, sessao.status, sessao.segmento_inicio, sessao.motivo);
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("já existe sessão para esta etapa");
      throw e;
    }
  }

  /**
   * Fecha o segmento aberto e abre o seguinte, ou encerra a sessão quando
   * `proximo` é nulo, numa transação só.
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
    const transacao = this.db.transaction((): boolean => {
      const s = this.sql("select * from sessoes where etapa_id = ?").get(etapaId) as
        | Sessao
        | undefined;
      if (!s || s.status !== statusEsperado) return false;

      const tipo: Tipo = s.status === "EM_ANDAMENTO" ? "OPERACAO" : "PAUSA";

      // O sequencial sai do próprio banco, dentro do mesmo comando: dois
      // apontamentos gravados ao mesmo tempo não disputam o número.
      this.sql(
        `insert into apontamentos
           (id, numero, etapa_id, numero_os, tipo, inicio, fim, duracao_segundos, justificativa)
         values (?, (select coalesce(max(numero), 0) + 1 from apontamentos), ?, ?, ?, ?, ?, ?, ?)`
      ).run(
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
      if (proximo) {
        this.sql(
          "update sessoes set status = ?, segmento_inicio = ?, motivo = ? where etapa_id = ?"
        ).run(proximo.status, fimISO, proximo.motivo, etapaId);
      } else {
        this.sql("delete from sessoes where etapa_id = ?").run(etapaId);
      }

      return true;
    });

    return transacao.immediate();
  }

  // ---- apontamentos -----------------------------------------------------

  async revisaoApontamentos(): Promise<number> {
    const { maior } = this.sql("select coalesce(max(numero), 0) as maior from apontamentos").get() as {
      maior: number;
    };
    return maior;
  }

  async existeApontamento(etapaId: string, numeroOs: string): Promise<boolean> {
    const achou = this.sql(
      "select 1 from apontamentos where etapa_id = ? and numero_os = ? limit 1"
    ).get(etapaId, numeroOs);
    return achou !== undefined;
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

    // Desempate por `numero`: várias etapas costumam ter o mesmo início,
    // porque o tempo é truncado ao segundo, e a ordem precisa ser a mesma a
    // cada consulta.
    return this.sql(
      `select a.*, e.nome as etapa_nome
         from apontamentos a
         join etapas e on e.id = a.etapa_id
         ${onde}
        order by a.inicio asc, a.numero asc`
    ).all(...valores) as LinhaApontamento[];
  }

  // ---- usuários do painel ------------------------------------------------

  async contarUsuarios(): Promise<number> {
    const { total } = this.sql("select count(*) as total from usuarios").get() as { total: number };
    return total;
  }

  async listarUsuarios(): Promise<Usuario[]> {
    return (this.sql("select * from usuarios order by nome_chave").all() as UsuarioBruto[]).map(
      comoUsuario
    );
  }

  async obterUsuario(id: string): Promise<Usuario | null> {
    const u = this.sql("select * from usuarios where id = ?").get(id) as UsuarioBruto | undefined;
    return u ? comoUsuario(u) : null;
  }

  async obterUsuarioPorNome(nome: string): Promise<UsuarioComSenha | null> {
    // Pela chave: quem cadastrou "João" entra como "JOÃO" ou "joão".
    const u = this.sql("select * from usuarios where nome_chave = ?").get(chaveDeNome(nome)) as
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
      versao_sessao: 0,
    };
    try {
      this.sql(
        `insert into usuarios (id, nome, nome_chave, tipo, ativo, senha_hash, primeiro_login, versao_sessao)
         values (?, ?, ?, ?, 1, ?, 1, 0)`
      ).run(usuario.id, nome, chaveDeNome(nome), tipo, senhaHash);
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de usuário repetido");
      throw e;
    }
    return usuario;
  }

  async renomearUsuario(id: string, nome: string): Promise<void> {
    try {
      this.sql("update usuarios set nome = ?, nome_chave = ? where id = ?").run(
        nome,
        chaveDeNome(nome),
        id
      );
    } catch (e) {
      if (ehViolacaoUnica(e)) throw new ErroUnicidade("nome de usuário repetido");
      throw e;
    }
  }

  async definirTipoUsuario(id: string, tipo: TipoAcesso): Promise<void> {
    this.sql("update usuarios set tipo = ? where id = ?").run(tipo, id);
  }

  async definirAtivoUsuario(id: string, ativo: boolean): Promise<void> {
    this.sql(
      "update usuarios set ativo = ?, versao_sessao = versao_sessao + 1 where id = ?"
    ).run(ativo ? 1 : 0, id);
  }

  async definirSenhaUsuario(id: string, senhaHash: string, primeiroLogin: boolean): Promise<void> {
    this.sql(
      `update usuarios
          set senha_hash = ?, primeiro_login = ?, versao_sessao = versao_sessao + 1
        where id = ?`
    ).run(senhaHash, primeiroLogin ? 1 : 0, id);
  }

  async excluirUsuario(id: string): Promise<void> {
    this.sql("delete from usuarios where id = ?").run(id);
  }

  // ---- configuração do próprio sistema -----------------------------------

  async obterConfiguracao(chave: string): Promise<string | null> {
    const linha = this.sql("select valor from configuracao where chave = ?").get(chave) as
      | { valor: string }
      | undefined;
    return linha?.valor ?? null;
  }

  async fixarConfiguracao(chave: string, valor: string): Promise<string> {
    // `insert or ignore` e releitura na mesma transação: se dois processos
    // sortearem uma chave de sessão ao mesmo tempo, os dois saem com a mesma.
    return this.db
      .transaction((): string => {
        this.sql("insert or ignore into configuracao (chave, valor) values (?, ?)").run(chave, valor);
        const linha = this.sql("select valor from configuracao where chave = ?").get(chave) as {
          valor: string;
        };
        return linha.valor;
      })
      .immediate();
  }
}

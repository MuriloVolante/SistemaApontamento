import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { repositorio } from "./repositorio";
import type { SessaoUsuario } from "./tipos";

const COOKIE = "apontamento_sessao";
const DIAS = 7;
const CHAVE_SEGREDO = "segredo_sessao";

/** O que vai assinado dentro do cookie. */
interface Conteudo extends SessaoUsuario {
  /** Entrou com a senha padrão: só pode trocar a senha, mais nada. */
  trocar: boolean;
  /** `versao_sessao` do usuário na hora do login. */
  v: number;
  exp: number;
}

/** A sessão lida do cookie, ainda sem conferir o usuário no banco. */
export interface SessaoLida extends SessaoUsuario {
  trocar: boolean;
  versao: number;
}

/**
 * Chave que assina os cookies, guardada no banco.
 *
 * Fica no banco, e não numa variável de ambiente, porque o sistema tem de
 * subir sem configuração nenhuma. E não é sorteada a cada partida: assim
 * ninguém é desconectado quando o servidor reinicia.
 *
 * `fixarConfiguracao` só grava se ainda não houver valor e devolve o que ficou
 * valendo, porque o Next levanta mais de um processo, e dois sorteando ao mesmo
 * tempo precisam terminar com a mesma chave.
 *
 * Lida uma vez por processo e guardada: ela não muda, e consultar o banco a
 * cada requisição só para isso seria desperdício.
 */
let segredoGuardado: Promise<string> | null = null;

function segredo(): Promise<string> {
  segredoGuardado ??= (async () => {
    const repo = await repositorio();
    const guardado = await repo.obterConfiguracao(CHAVE_SEGREDO);
    if (guardado) return guardado;
    return repo.fixarConfiguracao(CHAVE_SEGREDO, randomBytes(32).toString("hex"));
  })().catch((erro) => {
    // Falhou (banco indisponível, por exemplo): a próxima chamada tenta de novo.
    segredoGuardado = null;
    throw erro;
  });
  return segredoGuardado;
}

function assinar(carga: string, chave: string): string {
  return createHmac("sha256", chave).update(carga).digest("base64url");
}

/**
 * Grava o cookie da sessão.
 *
 * Sem `secure`: a gráfica acessa o painel por http, no endereço da máquina
 * dentro da rede local, e um cookie `secure` simplesmente nunca seria enviado.
 * `httpOnly` impede que script algum na página leia o cookie, e `sameSite`
 * impede que outro site o use por tabela.
 */
export async function criarSessao(
  usuario: SessaoUsuario,
  trocar: boolean,
  versao: number
): Promise<void> {
  const conteudo: Conteudo = {
    ...usuario,
    trocar,
    v: versao,
    exp: Date.now() + DIAS * 86_400_000,
  };
  const carga = Buffer.from(JSON.stringify(conteudo)).toString("base64url");

  (await cookies()).set(COOKIE, `${carga}.${assinar(carga, await segredo())}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DIAS * 86_400,
  });
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

/** Lê e confere a assinatura do cookie. Null quando não há sessão válida. */
export async function lerSessao(): Promise<SessaoLida | null> {
  const bruto = (await cookies()).get(COOKIE)?.value;
  if (!bruto) return null;

  const separador = bruto.lastIndexOf(".");
  if (separador < 1) return null;
  const carga = bruto.slice(0, separador);
  const assinatura = bruto.slice(separador + 1);

  const esperada = Buffer.from(assinar(carga, await segredo()));
  const recebida = Buffer.from(assinatura);
  if (esperada.length !== recebida.length || !timingSafeEqual(esperada, recebida)) return null;

  try {
    const c = JSON.parse(Buffer.from(carga, "base64url").toString("utf8")) as Conteudo;
    if (!c.exp || c.exp < Date.now()) return null;
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      trocar: Boolean(c.trocar),
      versao: typeof c.v === "number" ? c.v : -1,
    };
  } catch {
    return null;
  }
}

/**
 * Sessão completa de quem pode usar o painel agora, conferida no banco.
 *
 * O cookie só diz quem entrou e quando. O resto vem do banco a cada chamada,
 * e por isso vale na hora:
 * - usuário excluído ou inativado perde o acesso;
 * - senha resetada ou trocada derruba toda sessão aberta antes, porque a
 *   `versao_sessao` mudou e deixa de bater com a do cookie;
 * - senha ainda provisória não abre o painel, só a troca de senha;
 * - nome e perfil são os de agora: gestor rebaixado perde as abas de gestor,
 *   vendedor promovido as ganha.
 */
export async function validarSessao(): Promise<SessaoUsuario | null> {
  const sessao = await lerSessao();
  if (!sessao || sessao.trocar) return null;

  const usuario = await (await repositorio()).obterUsuario(sessao.id);
  if (!usuario || !usuario.ativo || usuario.primeiro_login) return null;
  if (usuario.versao_sessao !== sessao.versao) return null;

  return { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo };
}

/**
 * Para as ações do servidor: sem sessão válida, manda para o login.
 *
 * `redirect` e não `throw`: um erro lançado por Server Action chega à tela,
 * em produção, trocado por um texto genérico em inglês, e a pessoa ficava
 * parada nele. O redirecionamento o Next entrega ao navegador como navegação.
 */
export async function exigirAcesso(): Promise<SessaoUsuario> {
  const sessao = await validarSessao();
  if (!sessao) redirect("/login");
  return sessao;
}

/** Idem, mas só passa quem é gestor; o vendedor volta para a consulta de OS. */
export async function exigirGestor(): Promise<SessaoUsuario> {
  const sessao = await exigirAcesso();
  if (sessao.tipo !== "GESTOR") redirect("/painel");
  return sessao;
}

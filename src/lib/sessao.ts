import { cookies } from "next/headers";
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
  exp: number;
}

/** A sessão lida do cookie, ainda sem conferir o usuário no banco. */
export interface SessaoLida extends SessaoUsuario {
  trocar: boolean;
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
 */
async function segredo(): Promise<string> {
  const repo = await repositorio();
  const guardado = await repo.obterConfiguracao(CHAVE_SEGREDO);
  if (guardado) return guardado;
  return repo.fixarConfiguracao(CHAVE_SEGREDO, randomBytes(32).toString("hex"));
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
export async function criarSessao(usuario: SessaoUsuario, trocar: boolean): Promise<void> {
  const conteudo: Conteudo = { ...usuario, trocar, exp: Date.now() + DIAS * 86_400_000 };
  const carga = Buffer.from(JSON.stringify(conteudo)).toString("base64url");

  cookies().set(COOKIE, `${carga}.${assinar(carga, await segredo())}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: DIAS * 86_400,
  });
}

export function encerrarSessao(): void {
  cookies().delete(COOKIE);
}

/** Lê e confere a assinatura do cookie. Null quando não há sessão válida. */
export async function lerSessao(): Promise<SessaoLida | null> {
  const bruto = cookies().get(COOKIE)?.value;
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
    return { id: c.id, nome: c.nome, tipo: c.tipo, trocar: Boolean(c.trocar) };
  } catch {
    return null;
  }
}

/** Erro reconhecido pelas telas: manda voltar para o login. */
export class SemAcesso extends Error {
  constructor(mensagem = "Sua sessão terminou. Entre de novo.") {
    super(mensagem);
    this.name = "SemAcesso";
  }
}

/**
 * Sessão válida de um usuário que ainda existe e continua ativo.
 *
 * O cookie é conferido contra o banco a cada ação, e não só na entrada: sem
 * isso, inativar ou excluir alguém não teria efeito nenhum até o cookie dele
 * vencer, dias depois.
 */
export async function exigirAcesso(): Promise<SessaoUsuario> {
  const sessao = await lerSessao();
  if (!sessao) throw new SemAcesso();
  if (sessao.trocar) throw new SemAcesso("Troque a senha para continuar.");

  const usuario = await (await repositorio()).obterUsuario(sessao.id);
  if (!usuario || !usuario.ativo) throw new SemAcesso("Este usuário não tem mais acesso.");

  // O tipo vem do banco, não do cookie: mudar o perfil de alguém vale na hora.
  return { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo };
}

/** Idem, mas só passa quem é gestor. */
export async function exigirGestor(): Promise<SessaoUsuario> {
  const sessao = await exigirAcesso();
  if (sessao.tipo !== "GESTOR") throw new SemAcesso("Esta tela é só para gestores.");
  return sessao;
}

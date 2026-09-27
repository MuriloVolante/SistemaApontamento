"use server";

import { repositorio } from "@/lib/repositorio";
import { conferir, criticarSenhaNova, embaralhar, SENHA_PADRAO } from "@/lib/senha";
import { criarSessao, encerrarSessao, lerSessao } from "@/lib/sessao";
import type { Resultado, SessaoUsuario } from "@/lib/tipos";

/** Nome do gestor criado quando o sistema ainda não tem nenhum usuário. */
const GESTOR_INICIAL = "gestor";

/**
 * Garante que exista pelo menos um gestor.
 *
 * Sem isto, um banco novo trancaria a porta com a chave do lado de dentro:
 * criar usuário exige ser gestor, e não haveria nenhum. O gestor inicial nasce
 * com a senha padrão e com a troca obrigatória ligada, então a primeira coisa
 * que acontece no sistema é alguém definir uma senha de verdade.
 */
async function garantirGestorInicial(): Promise<void> {
  const repo = await repositorio();
  if ((await repo.listarUsuarios()).length > 0) return;

  try {
    await repo.criarUsuario(GESTOR_INICIAL, "GESTOR", embaralhar(SENHA_PADRAO));
  } catch {
    // Dois processos subindo juntos: o segundo encontra o nome já usado e
    // pode seguir em frente, o que importava era existir um gestor.
  }
}

/** Quem está no painel agora, ou null. Usado pelas telas, não por segurança. */
export async function sessaoAtual(): Promise<(SessaoUsuario & { trocar: boolean }) | null> {
  return lerSessao();
}

/** Existe algum usuário com a senha ainda por definir? Só para o texto da tela. */
export async function precisaDefinirSenha(): Promise<boolean> {
  const sessao = await lerSessao();
  return Boolean(sessao?.trocar);
}

export async function entrar(
  nome: string,
  senha: string
): Promise<Resultado<{ trocarSenha: boolean }>> {
  const usuario = nome.trim();
  if (!usuario || !senha) return { ok: false, erro: "Informe o usuário e a senha." };

  await garantirGestorInicial();

  const encontrado = await (await repositorio()).obterUsuarioPorNome(usuario);

  // Mensagem única para usuário inexistente e senha errada: dizer qual dos
  // dois falhou entregaria a lista de quem tem acesso a quem ficar tentando.
  const generico = { ok: false as const, erro: "Usuário ou senha incorretos." };
  if (!encontrado) return generico;
  if (!conferir(senha, encontrado.senha_hash)) return generico;

  if (!encontrado.ativo) return { ok: false, erro: "Este usuário está inativo." };

  const dados = { id: encontrado.id, nome: encontrado.nome, tipo: encontrado.tipo };

  // Com a senha ainda provisória, a sessão nasce restrita: serve só para
  // chegar ao formulário de troca, e `exigirAcesso` recusa todo o resto.
  await criarSessao(dados, encontrado.primeiro_login);

  return { ok: true, dados: { trocarSenha: encontrado.primeiro_login } };
}

/**
 * Define a senha no primeiro acesso (ou depois de um reset).
 *
 * Só vale para quem já provou a senha provisória: a sessão restrita criada
 * por `entrar` é a credencial aqui.
 */
export async function definirSenha(nova: string, confirmacao: string): Promise<Resultado> {
  const sessao = await lerSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão terminou. Entre de novo." };

  const critica = criticarSenhaNova(nova, confirmacao);
  if (critica) return { ok: false, erro: critica };

  const repo = await repositorio();
  const usuario = await repo.obterUsuario(sessao.id);
  if (!usuario || !usuario.ativo) {
    return { ok: false, erro: "Este usuário não tem mais acesso." };
  }

  await repo.definirSenhaUsuario(sessao.id, embaralhar(nova), false);

  // A sessão renasce sem a restrição: daqui em diante o painel abre inteiro.
  await criarSessao({ id: usuario.id, nome: usuario.nome, tipo: usuario.tipo }, false);

  return { ok: true, dados: null };
}

export async function sair(): Promise<void> {
  encerrarSessao();
}

"use server";

import { ErroUnicidade, repositorio } from "@/lib/repositorio";
import { embaralhar, SENHA_PADRAO } from "@/lib/senha";
import { exigirGestor, lerSessao } from "@/lib/sessao";
import type { Resultado, TipoAcesso, Usuario } from "@/lib/tipos";

/**
 * Gestão de usuários do painel. Toda ação daqui exige ser gestor, e a conferência
 * é do servidor, não da tela: esconder um botão não protege nada, porque a
 * ação continuaria alcançável por quem soubesse chamá-la.
 */
export async function listarUsuarios(): Promise<Usuario[]> {
  await exigirGestor();
  return (await repositorio()).listarUsuarios();
}

export async function criarUsuario(nome: string, tipo: TipoAcesso): Promise<Resultado<Usuario>> {
  await exigirGestor();

  const limpo = nome.trim();
  if (!limpo) return { ok: false, erro: "Informe o nome do usuário." };
  if (tipo !== "GESTOR" && tipo !== "VENDEDOR") {
    return { ok: false, erro: "Escolha o tipo de acesso." };
  }

  try {
    // Nasce com a senha padrão e a troca pendente: a senha de verdade é
    // definida pela própria pessoa, no primeiro login.
    const usuario = await (await repositorio()).criarUsuario(limpo, tipo, embaralhar(SENHA_PADRAO));
    return { ok: true, dados: usuario };
  } catch (e) {
    if (e instanceof ErroUnicidade) return { ok: false, erro: "Já existe um usuário com esse nome." };
    return { ok: false, erro: (e as Error).message };
  }
}

export async function renomearUsuario(id: string, nome: string): Promise<Resultado> {
  await exigirGestor();

  const limpo = nome.trim();
  if (!limpo) return { ok: false, erro: "Informe o nome do usuário." };

  try {
    await (await repositorio()).renomearUsuario(id, limpo);
    return { ok: true, dados: null };
  } catch (e) {
    if (e instanceof ErroUnicidade) return { ok: false, erro: "Já existe um usuário com esse nome." };
    return { ok: false, erro: (e as Error).message };
  }
}

export async function definirTipoUsuario(id: string, tipo: TipoAcesso): Promise<Resultado> {
  const gestor = await exigirGestor();

  if (tipo !== "GESTOR" && tipo !== "VENDEDOR") return { ok: false, erro: "Escolha o tipo de acesso." };

  // Rebaixar a si mesmo tira o acesso a esta própria tela, no meio do clique.
  if (tipo === "VENDEDOR" && id === gestor.id) {
    return { ok: false, erro: "Você não pode mudar o seu próprio perfil de acesso." };
  }
  if (tipo === "VENDEDOR" && (await semOutroGestorAtivo(id))) {
    return { ok: false, erro: "Este é o único gestor ativo. Promova outro antes de rebaixá-lo." };
  }

  try {
    await (await repositorio()).definirTipoUsuario(id, tipo);
    return { ok: true, dados: null };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function definirAtivoUsuario(id: string, ativo: boolean): Promise<Resultado> {
  const gestor = await exigirGestor();

  // Inativar a si mesmo tranca a porta na hora, no meio da própria tela.
  if (!ativo && id === gestor.id) {
    return { ok: false, erro: "Você não pode inativar o seu próprio usuário." };
  }
  if (!ativo && (await semOutroGestorAtivo(id))) {
    return { ok: false, erro: "Este é o único gestor ativo. Crie outro antes de inativá-lo." };
  }

  try {
    await (await repositorio()).definirAtivoUsuario(id, ativo);
    return { ok: true, dados: null };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Devolve a senha padrão à pessoa e reativa a troca obrigatória. */
export async function resetarSenhaUsuario(id: string): Promise<Resultado<{ senha: string }>> {
  await exigirGestor();

  try {
    await (await repositorio()).definirSenhaUsuario(id, embaralhar(SENHA_PADRAO), true);
    return { ok: true, dados: { senha: SENHA_PADRAO } };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

export async function excluirUsuario(id: string): Promise<Resultado> {
  const gestor = await exigirGestor();

  if (id === gestor.id) return { ok: false, erro: "Você não pode excluir o seu próprio usuário." };
  if (await semOutroGestorAtivo(id)) {
    return { ok: false, erro: "Este é o único gestor ativo. Crie outro antes de excluí-lo." };
  }

  try {
    await (await repositorio()).excluirUsuario(id);
    return { ok: true, dados: null };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/**
 * Tirar este usuário deixaria o sistema sem nenhum gestor ativo?
 *
 * Sem esta trava dá para chegar a um banco em que ninguém consegue mais
 * cadastrar ninguém, e a saída seria mexer no banco na mão.
 */
async function semOutroGestorAtivo(id: string): Promise<boolean> {
  const usuarios = await (await repositorio()).listarUsuarios();
  const alvo = usuarios.find((u) => u.id === id);
  if (!alvo || alvo.tipo !== "GESTOR" || !alvo.ativo) return false;

  return !usuarios.some((u) => u.id !== id && u.tipo === "GESTOR" && u.ativo);
}

/** Usado pela tela para marcar a própria linha e esconder ações sem sentido. */
export async function meuId(): Promise<string | null> {
  return (await lerSessao())?.id ?? null;
}

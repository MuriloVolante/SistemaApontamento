"use server";

import { falhaInesperada } from "@/lib/erros";
import { LIMITES } from "@/lib/nomes";
import { ErroUnicidade, repositorio } from "@/lib/repositorio";
import { embaralhar, SENHA_PADRAO } from "@/lib/senha";
import { exigirGestor } from "@/lib/sessao";
import type { Resultado, TipoAcesso, Usuario } from "@/lib/tipos";

/**
 * Gestão de usuários do painel. Toda ação daqui exige ser gestor, e a
 * conferência é do servidor, não da tela: esconder um botão não protege nada,
 * porque a ação continuaria alcançável por quem soubesse chamá-la.
 */
export async function listarUsuarios(): Promise<Usuario[]> {
  await exigirGestor();
  return (await repositorio()).listarUsuarios();
}

/** Nome limpo, ou a mensagem que explica por que não serve. */
function criticarNome(nome: string): { nome: string } | { erro: string } {
  const limpo = nome.trim();
  if (!limpo) return { erro: "Informe o nome do usuário." };
  if (limpo.length > LIMITES.nome) {
    return { erro: `O nome pode ter no máximo ${LIMITES.nome} caracteres.` };
  }
  return { nome: limpo };
}

export async function criarUsuario(nome: string, tipo: TipoAcesso): Promise<Resultado<Usuario>> {
  await exigirGestor();

  const critica = criticarNome(nome);
  if ("erro" in critica) return { ok: false, erro: critica.erro };
  if (tipo !== "GESTOR" && tipo !== "VENDEDOR") {
    return { ok: false, erro: "Escolha o tipo de acesso." };
  }

  try {
    // Nasce com a senha padrão e a troca pendente: a senha de verdade é
    // definida pela própria pessoa, no primeiro login.
    const usuario = await (await repositorio()).criarUsuario(
      critica.nome,
      tipo,
      await embaralhar(SENHA_PADRAO)
    );
    return { ok: true, dados: usuario };
  } catch (e) {
    if (e instanceof ErroUnicidade) return { ok: false, erro: "Já existe um usuário com esse nome." };
    return falhaInesperada("criarUsuario", e);
  }
}

export async function renomearUsuario(id: string, nome: string): Promise<Resultado> {
  await exigirGestor();

  const critica = criticarNome(nome);
  if ("erro" in critica) return { ok: false, erro: critica.erro };

  try {
    await (await repositorio()).renomearUsuario(id, critica.nome);
    return { ok: true, dados: null };
  } catch (e) {
    if (e instanceof ErroUnicidade) return { ok: false, erro: "Já existe um usuário com esse nome." };
    return falhaInesperada("renomearUsuario", e);
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
    return falhaInesperada("definirTipoUsuario", e);
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
    return falhaInesperada("definirAtivoUsuario", e);
  }
}

/**
 * Devolve a senha padrão à pessoa e religa a troca obrigatória. Toda sessão
 * aberta dela cai na hora: a `versao_sessao` muda junto com a senha.
 */
export async function resetarSenhaUsuario(id: string): Promise<Resultado> {
  await exigirGestor();

  try {
    await (await repositorio()).definirSenhaUsuario(id, await embaralhar(SENHA_PADRAO), true);
    return { ok: true, dados: null };
  } catch (e) {
    return falhaInesperada("resetarSenhaUsuario", e);
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
    return falhaInesperada("excluirUsuario", e);
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

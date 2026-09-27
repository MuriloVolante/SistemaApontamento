"use server";

import { headers } from "next/headers";
import { falhaInesperada } from "@/lib/erros";
import { chaveDeNome } from "@/lib/nomes";
import { ErroUnicidade, repositorio } from "@/lib/repositorio";
import {
  conferir,
  criticarSenhaNova,
  embaralhar,
  HASH_FICTICIO,
  SENHA_PADRAO,
} from "@/lib/senha";
import { criarSessao, encerrarSessao, lerSessao, validarSessao } from "@/lib/sessao";
import { registrarFalha, registrarSucesso, segundosDeBloqueio } from "@/lib/tentativas";
import type { Resultado } from "@/lib/tipos";

/** Nome do gestor criado quando o sistema ainda não tem nenhum usuário. */
const GESTOR_INICIAL = "gestor";

/**
 * Garante que exista pelo menos um usuário.
 *
 * Sem isto, um banco novo trancaria a porta com a chave do lado de dentro:
 * criar usuário exige ser gestor, e não haveria nenhum. O gestor inicial nasce
 * com a senha padrão e com a troca obrigatória ligada, então a primeira coisa
 * que acontece no sistema é alguém definir uma senha de verdade.
 */
async function garantirGestorInicial(): Promise<void> {
  const repo = await repositorio();
  if ((await repo.contarUsuarios()) > 0) return;

  try {
    await repo.criarUsuario(GESTOR_INICIAL, "GESTOR", await embaralhar(SENHA_PADRAO));
  } catch (e) {
    // Dois processos subindo juntos: o segundo encontra o nome já usado e pode
    // seguir, porque o que importava era existir um gestor. Qualquer outro
    // erro é de verdade e sobe.
    if (!(e instanceof ErroUnicidade)) throw e;
  }
}

/** A sessão atual é a restrita, de quem ainda precisa definir a senha? */
export async function precisaDefinirSenha(): Promise<boolean> {
  const sessao = await lerSessao();
  return Boolean(sessao?.trocar);
}

/** Endereço de quem está tentando entrar, quando o servidor o conhece. */
async function enderecoDoCliente(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
}

export async function entrar(
  nome: string,
  senha: string
): Promise<Resultado<{ trocarSenha: boolean }>> {
  const usuario = nome.trim();
  if (!usuario || !senha) return { ok: false, erro: "Informe o usuário e a senha." };

  const chaveTentativa = `${chaveDeNome(usuario).slice(0, 60)}|${await enderecoDoCliente()}`;
  const espera = segundosDeBloqueio(chaveTentativa);
  if (espera > 0) {
    return { ok: false, erro: `Muitas tentativas erradas. Aguarde ${espera} s e tente de novo.` };
  }

  try {
    await garantirGestorInicial();
    const encontrado = await (await repositorio()).obterUsuarioPorNome(usuario);

    // Mensagem única para usuário inexistente, senha errada e usuário inativo:
    // dizer qual dos três falhou entregaria a quem fica tentando a lista de
    // quem tem cadastro, ou a senha certa de uma conta desligada. A senha é
    // conferida mesmo sem usuário, contra um hash fictício, para o tempo de
    // resposta também não entregar.
    const generico = { ok: false as const, erro: "Usuário ou senha incorretos." };
    const senhaCerta = await conferir(senha, encontrado?.senha_hash ?? HASH_FICTICIO);

    if (!encontrado || !senhaCerta) {
      registrarFalha(chaveTentativa);
      return generico;
    }
    if (!encontrado.ativo) return generico;

    registrarSucesso(chaveTentativa);

    // Com a senha ainda provisória, a sessão nasce restrita: serve só para
    // chegar ao formulário de troca, e o painel recusa todo o resto.
    await criarSessao(
      { id: encontrado.id, nome: encontrado.nome, tipo: encontrado.tipo },
      encontrado.primeiro_login,
      encontrado.versao_sessao
    );

    return { ok: true, dados: { trocarSenha: encontrado.primeiro_login } };
  } catch (e) {
    return falhaInesperada("entrar", e);
  }
}

/**
 * Define a senha no primeiro acesso ou depois de um reset.
 *
 * Só vale para a sessão restrita que `entrar` cria quando a senha ainda é a
 * padrão: foi com ela que a pessoa provou quem é. Quem já está com a sessão
 * completa troca a senha por `trocarPropriaSenha`, que pede a atual.
 */
export async function definirSenha(nova: string, confirmacao: string): Promise<Resultado> {
  const sessao = await lerSessao();
  if (!sessao?.trocar) return { ok: false, erro: "Sua sessão terminou. Entre de novo." };

  const critica = criticarSenhaNova(nova, confirmacao);
  if (critica) return { ok: false, erro: critica };

  try {
    const repo = await repositorio();
    const usuario = await repo.obterUsuario(sessao.id);

    // Um segundo reset depois deste login já trocou a versão: o cookie velho
    // não serve mais nem para isto.
    if (!usuario || !usuario.ativo || usuario.versao_sessao !== sessao.versao) {
      return { ok: false, erro: "Sua sessão terminou. Entre de novo." };
    }

    await repo.definirSenhaUsuario(sessao.id, await embaralhar(nova), false);
    return renovarSessao(sessao.id);
  } catch (e) {
    return falhaInesperada("definirSenha", e);
  }
}

/**
 * Troca da própria senha por quem já está no painel. Pede a senha atual: uma
 * aba esquecida aberta não pode bastar para alguém tomar a conta.
 */
export async function trocarPropriaSenha(
  atual: string,
  nova: string,
  confirmacao: string
): Promise<Resultado> {
  const sessao = await validarSessao();
  if (!sessao) return { ok: false, erro: "Sua sessão terminou. Entre de novo." };

  const critica = criticarSenhaNova(nova, confirmacao);
  if (critica) return { ok: false, erro: critica };

  try {
    const repo = await repositorio();
    const comSenha = await repo.obterUsuarioPorNome(sessao.nome);
    if (!comSenha || !(await conferir(atual, comSenha.senha_hash))) {
      return { ok: false, erro: "A senha atual não confere." };
    }

    await repo.definirSenhaUsuario(sessao.id, await embaralhar(nova), false);
    // A versão mudou e derrubou as outras sessões desta pessoa; esta aqui
    // renasce com a versão nova para continuar aberta.
    return renovarSessao(sessao.id);
  } catch (e) {
    return falhaInesperada("trocarPropriaSenha", e);
  }
}

/** Regrava o cookie com o estado atual do usuário, já sem restrição. */
async function renovarSessao(id: string): Promise<Resultado> {
  const usuario = await (await repositorio()).obterUsuario(id);
  if (!usuario) return { ok: false, erro: "Sua sessão terminou. Entre de novo." };

  await criarSessao(
    { id: usuario.id, nome: usuario.nome, tipo: usuario.tipo },
    false,
    usuario.versao_sessao
  );
  return { ok: true, dados: null };
}

export async function sair(): Promise<void> {
  await encerrarSessao();
}

"use server";

import { falhaInesperada } from "@/lib/erros";
import { LIMITES } from "@/lib/nomes";
import { agora, repositorio, ErroUnicidade } from "@/lib/repositorio";
import { exigirAcesso, exigirGestor } from "@/lib/sessao";
import type { Etapa, EstadoEtapa, PainelAtivo, Resultado } from "@/lib/tipos";

// =====================================================================
// Etapas
// =====================================================================

/**
 * Lista de etapas. É a única leitura sem trava: a tela de escolha da máquina
 * roda antes de qualquer login, e é dela que o operador precisa.
 */
export async function listarEtapas(apenasAtivas = false): Promise<Etapa[]> {
  return (await repositorio()).listarEtapas(apenasAtivas);
}

/** Nome limpo, ou a mensagem que explica por que não serve. */
function criticarNomeEtapa(nome: string): { nome: string } | { erro: string } {
  const limpo = nome.trim();
  if (!limpo) return { erro: "Informe o nome da etapa." };
  if (limpo.length > LIMITES.nome) {
    return { erro: `O nome pode ter no máximo ${LIMITES.nome} caracteres.` };
  }
  return { nome: limpo };
}

export async function criarEtapa(nome: string): Promise<Resultado<Etapa>> {
  await exigirGestor();

  const critica = criticarNomeEtapa(nome);
  if ("erro" in critica) return { ok: false, erro: critica.erro };

  try {
    const etapa = await (await repositorio()).criarEtapa(critica.nome);
    return { ok: true, dados: etapa };
  } catch (e) {
    if (e instanceof ErroUnicidade) return { ok: false, erro: "Já existe uma etapa com esse nome." };
    return falhaInesperada("criarEtapa", e);
  }
}

export async function renomearEtapa(id: string, nome: string): Promise<Resultado> {
  await exigirGestor();

  const critica = criticarNomeEtapa(nome);
  if ("erro" in critica) return { ok: false, erro: critica.erro };

  try {
    await (await repositorio()).renomearEtapa(id, critica.nome);
    return { ok: true, dados: null };
  } catch (e) {
    if (e instanceof ErroUnicidade) return { ok: false, erro: "Já existe uma etapa com esse nome." };
    return falhaInesperada("renomearEtapa", e);
  }
}

export async function definirAtivaEtapa(id: string, ativa: boolean): Promise<Resultado> {
  await exigirGestor();

  try {
    const repo = await repositorio();

    // Inativar uma etapa com apontamento em curso deixaria o ciclo aberto pela metade.
    if (!ativa && (await repo.obterSessao(id))) {
      return {
        ok: false,
        erro: "Esta etapa tem um apontamento em andamento. Finalize-o antes de inativar.",
      };
    }

    await repo.definirAtivaEtapa(id, ativa);
    return { ok: true, dados: null };
  } catch (e) {
    return falhaInesperada("definirAtivaEtapa", e);
  }
}

/** Exclui apenas etapas sem apontamentos vinculados; as demais só podem ser inativadas. */
export async function excluirEtapa(id: string): Promise<Resultado> {
  await exigirGestor();

  try {
    const repo = await repositorio();

    if ((await repo.contarApontamentosDaEtapa(id)) > 0) {
      return {
        ok: false,
        erro: "Etapa com apontamentos vinculados não pode ser excluída. Inative-a.",
      };
    }
    if (await repo.obterSessao(id)) {
      return { ok: false, erro: "Esta etapa tem um apontamento em andamento." };
    }

    await repo.excluirEtapa(id);
    return { ok: true, dados: null };
  } catch (e) {
    return falhaInesperada("excluirEtapa", e);
  }
}

// =====================================================================
// Apontamento: tela do operador
// =====================================================================

/**
 * Estado atual da etapa. `agora` é o relógio do servidor: o navegador o usa
 * para corrigir o próprio relógio e recalcular o cronômetro por diferença de
 * timestamps a partir de `segmento_inicio` (regra 5).
 */
export async function obterEstado(etapaId: string): Promise<EstadoEtapa> {
  const repo = await repositorio();
  const etapa = await repo.obterEtapa(etapaId);
  const sessao = etapa ? await repo.obterSessao(etapaId) : null;
  return { etapa, sessao, agora: agora().toISOString() };
}

/**
 * Confere se esta OS já foi apontada nesta etapa antes.
 *
 * Serve de aviso na hora de iniciar: pode ser retrabalho, pode ser uma
 * segunda passagem normal, e quem sabe disso é quem está na máquina. Não
 * bloqueia nada, só informa.
 *
 * Sem recorte de data e sem olhar de qual computador veio: a regra é a
 * existência do apontamento, em qualquer momento e de qualquer máquina. Por
 * isso a pergunta ao banco é só "existe?", sem trazer linha nenhuma.
 */
export async function conferirPassagem(etapaId: string, numeroOs: string): Promise<boolean> {
  const os = numeroOs.trim();
  if (!os || os.length > LIMITES.os) return false;
  return (await repositorio()).existeApontamento(etapaId, os);
}

export async function iniciar(etapaId: string, numeroOs: string): Promise<Resultado<EstadoEtapa>> {
  const os = numeroOs.trim();
  if (!os) return { ok: false, erro: "Digite o número da OS para iniciar." };
  if (os.length > LIMITES.os) {
    return { ok: false, erro: `O número da OS pode ter no máximo ${LIMITES.os} caracteres.` };
  }

  try {
    const repo = await repositorio();

    // A tela só oferece etapas ativas, mas quem garante é aqui: uma aba aberta
    // desde antes da inativação, ou uma chamada feita à mão, não passa.
    const etapa = await repo.obterEtapa(etapaId);
    if (!etapa || !etapa.ativa) {
      return { ok: false, erro: "Esta máquina não está mais cadastrada ou foi desativada." };
    }

    if (await repo.obterSessao(etapaId)) {
      return { ok: false, erro: "Já existe um apontamento em andamento nesta etapa." };
    }

    try {
      await repo.criarSessao({
        etapa_id: etapaId,
        numero_os: os,
        status: "EM_ANDAMENTO",
        segmento_inicio: agora().toISOString(),
        motivo: null,
      });
    } catch (e) {
      if (e instanceof ErroUnicidade) {
        return { ok: false, erro: "Já existe um apontamento em andamento nesta etapa." };
      }
      throw e;
    }

    return { ok: true, dados: await obterEstado(etapaId) };
  } catch (e) {
    return falhaInesperada("iniciar", e);
  }
}

/** Fecha o segmento de Operação e abre o segmento de Pausa. */
export async function parar(etapaId: string, motivo: string): Promise<Resultado<EstadoEtapa>> {
  const texto = motivo.trim();
  if (!texto) return { ok: false, erro: "Informe o motivo da parada." };
  if (texto.length > LIMITES.motivo) {
    return { ok: false, erro: `O motivo pode ter no máximo ${LIMITES.motivo} caracteres.` };
  }

  try {
    const repo = await repositorio();
    const sessao = await repo.obterSessao(etapaId);
    if (!sessao) return { ok: false, erro: "Não há apontamento em andamento." };
    if (sessao.status !== "EM_ANDAMENTO") return { ok: false, erro: "O apontamento já está pausado." };

    // Fechar a operação e abrir a pausa é uma escrita só: se o clique chegar
    // duas vezes, o segundo encontra a sessão já pausada e não grava nada.
    const aplicado = await repo.avancarSegmento(etapaId, "EM_ANDAMENTO", agora().toISOString(), {
      status: "PAUSADO",
      motivo: texto,
    });
    if (!aplicado) return { ok: false, erro: "O apontamento já está pausado." };

    return { ok: true, dados: await obterEstado(etapaId) };
  } catch (e) {
    return falhaInesperada("parar", e);
  }
}

/** Fecha o segmento de Pausa com a justificativa e abre novo segmento de Operação. */
export async function retomar(etapaId: string): Promise<Resultado<EstadoEtapa>> {
  try {
    const repo = await repositorio();
    const sessao = await repo.obterSessao(etapaId);
    if (!sessao) return { ok: false, erro: "Não há apontamento em andamento." };
    if (sessao.status !== "PAUSADO") return { ok: false, erro: "O apontamento não está pausado." };

    const aplicado = await repo.avancarSegmento(etapaId, "PAUSADO", agora().toISOString(), {
      status: "EM_ANDAMENTO",
      motivo: null,
    });
    if (!aplicado) return { ok: false, erro: "O apontamento não está pausado." };

    return { ok: true, dados: await obterEstado(etapaId) };
  } catch (e) {
    return falhaInesperada("retomar", e);
  }
}

/** Fecha o segmento em aberto e encerra o apontamento, liberando a etapa. */
export async function finalizar(etapaId: string): Promise<Resultado<EstadoEtapa>> {
  try {
    const repo = await repositorio();
    const sessao = await repo.obterSessao(etapaId);
    if (!sessao) return { ok: false, erro: "Não há apontamento em andamento." };

    // `null` no lugar do próximo segmento: grava o último e libera a etapa.
    const aplicado = await repo.avancarSegmento(etapaId, sessao.status, agora().toISOString(), null);
    if (!aplicado) return { ok: false, erro: "O apontamento mudou de estado. Confira a tela." };

    return { ok: true, dados: await obterEstado(etapaId) };
  } catch (e) {
    return falhaInesperada("finalizar", e);
  }
}

/**
 * Apontamentos em curso em todas as etapas, para o dashboard. `agora` é o
 * relógio do servidor: o navegador o usa para recalcular cada cronômetro por
 * diferença de timestamps, igual à tela do operador.
 */
export async function listarSessoesAtivas(): Promise<PainelAtivo> {
  await exigirAcesso();

  const sessoes = await (await repositorio()).listarSessoesAtivas();
  return { sessoes, agora: agora().toISOString() };
}

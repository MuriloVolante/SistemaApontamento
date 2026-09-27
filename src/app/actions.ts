"use server";

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

export async function criarEtapa(nome: string): Promise<Resultado<Etapa>> {
  await exigirGestor();

  const limpo = nome.trim();
  if (!limpo) return { ok: false, erro: "Informe o nome da etapa." };

  try {
    const etapa = await (await repositorio()).criarEtapa(limpo);
    return { ok: true, dados: etapa };
  } catch (e) {
    if (e instanceof ErroUnicidade) {
      return { ok: false, erro: "Já existe uma etapa com esse nome." };
    }
    return { ok: false, erro: (e as Error).message };
  }
}

export async function renomearEtapa(id: string, nome: string): Promise<Resultado> {
  await exigirGestor();

  const limpo = nome.trim();
  if (!limpo) return { ok: false, erro: "Informe o nome da etapa." };

  try {
    await (await repositorio()).renomearEtapa(id, limpo);
    return { ok: true, dados: null };
  } catch (e) {
    if (e instanceof ErroUnicidade) {
      return { ok: false, erro: "Já existe uma etapa com esse nome." };
    }
    return { ok: false, erro: (e as Error).message };
  }
}

export async function definirAtivaEtapa(id: string, ativa: boolean): Promise<Resultado> {
  await exigirGestor();
  const repo = await repositorio();

  // Inativar uma etapa com apontamento em curso deixaria o ciclo aberto pela metade.
  if (!ativa && (await repo.obterSessao(id))) {
    return {
      ok: false,
      erro: "Esta etapa tem um apontamento em andamento. Finalize-o antes de inativar.",
    };
  }

  try {
    await repo.definirAtivaEtapa(id, ativa);
    return { ok: true, dados: null };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

/** Exclui apenas etapas sem apontamentos vinculados; as demais só podem ser inativadas. */
export async function excluirEtapa(id: string): Promise<Resultado> {
  await exigirGestor();
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

  try {
    await repo.excluirEtapa(id);
    return { ok: true, dados: null };
  } catch (e) {
    return { ok: false, erro: (e as Error).message };
  }
}

// =====================================================================
// Apontamento — tela do operador
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
 * bloqueia nada — só informa.
 */
export async function conferirPassagem(etapaId: string, numeroOs: string): Promise<boolean> {
  const os = numeroOs.trim();
  if (!os) return false;

  // Sem recorte de data e sem olhar de qual computador veio: a regra é a
  // existência do apontamento, em qualquer momento e de qualquer máquina.
  const linhas = await (await repositorio()).consultarApontamentos({ osExata: os, etapaId });
  return linhas.length > 0;
}

export async function iniciar(etapaId: string, numeroOs: string): Promise<Resultado<EstadoEtapa>> {
  const os = numeroOs.trim();
  if (!os) return { ok: false, erro: "Digite o número da OS para iniciar." };

  const repo = await repositorio();
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
    return { ok: false, erro: (e as Error).message };
  }

  return { ok: true, dados: await obterEstado(etapaId) };
}

/** Fecha o segmento de Operação e abre o segmento de Pausa. */
export async function parar(etapaId: string, motivo: string): Promise<Resultado<EstadoEtapa>> {
  const texto = motivo.trim();
  if (!texto) return { ok: false, erro: "Informe o motivo da parada." };

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
}

/** Fecha o segmento de Pausa com a justificativa e abre novo segmento de Operação. */
export async function retomar(etapaId: string): Promise<Resultado<EstadoEtapa>> {
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
}

/** Fecha o segmento em aberto e encerra o apontamento, liberando a etapa. */
export async function finalizar(etapaId: string): Promise<Resultado<EstadoEtapa>> {
  const repo = await repositorio();
  const sessao = await repo.obterSessao(etapaId);
  if (!sessao) return { ok: false, erro: "Não há apontamento em andamento." };

  // `null` no lugar do próximo segmento: grava o último e libera a etapa.
  const aplicado = await repo.avancarSegmento(etapaId, sessao.status, agora().toISOString(), null);
  if (!aplicado) return { ok: false, erro: "O apontamento mudou de estado. Confira a tela." };

  return { ok: true, dados: await obterEstado(etapaId) };
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

"use server";

import { repositorio } from "@/lib/repositorio";
import { exigirAcesso, exigirGestor } from "@/lib/sessao";
import type {
  FiltroConsulta,
  LinhaSintetico,
  ResultadoBuscaOs,
  ResultadoConsulta,
  Totais,
} from "@/lib/tipos";

/**
 * Linhas da tabela do painel e os três totais, sempre sob os mesmos filtros.
 *
 * Só gestor: é o histórico inteiro, e o vendedor tem acesso ao dashboard, não
 * ao histórico. Para os números do dashboard existe `totaisDoPeriodo`, que
 * devolve totais e nenhuma linha.
 */
export async function consultarApontamentos(f: FiltroConsulta): Promise<ResultadoConsulta> {
  await exigirGestor();
  return consultaInterna(f);
}

async function consultaInterna(f: FiltroConsulta): Promise<ResultadoConsulta> {
  const linhas = await (await repositorio()).consultarApontamentos(f);

  const totais: Totais = { total: 0, operacao: 0, pausa: 0 };
  for (const l of linhas) {
    totais.total += l.duracao_segundos;
    if (l.tipo === "OPERACAO") totais.operacao += l.duracao_segundos;
    else totais.pausa += l.duracao_segundos;
  }

  return { linhas, totais };
}

/** Os três números do dashboard, sem as linhas que os produziram. */
export async function totaisDoPeriodo(deISO?: string, ateISO?: string): Promise<Totais> {
  await exigirAcesso();
  const { totais } = await consultaInterna({ deISO, ateISO });
  return totais;
}

/** Tempo total, em operação e em pausa por etapa, para o relatório sintético. */
export async function relatorioSintetico(f: FiltroConsulta): Promise<LinhaSintetico[]> {
  await exigirGestor();
  const { linhas } = await consultaInterna(f);

  const porEtapa = new Map<string, LinhaSintetico>();
  for (const l of linhas) {
    const atual =
      porEtapa.get(l.etapa_nome) ??
      { etapa_nome: l.etapa_nome, total: 0, operacao: 0, pausa: 0 };

    atual.total += l.duracao_segundos;
    if (l.tipo === "OPERACAO") atual.operacao += l.duracao_segundos;
    else atual.pausa += l.duracao_segundos;

    porEtapa.set(l.etapa_nome, atual);
  }

  return [...porEtapa.values()].sort((a, b) =>
    a.etapa_nome.localeCompare(b.etapa_nome, "pt-BR")
  );
}

/**
 * Busca uma OS pelo número exato: onde ela está agora e todo o histórico
 * dela. Serve para responder ao cliente que liga perguntando do material.
 */
export async function buscarOs(numeroOs: string): Promise<ResultadoBuscaOs> {
  await exigirAcesso();

  const os = numeroOs.trim();
  if (!os) return { os: "", sessao: null, linhas: [], totais: { total: 0, operacao: 0, pausa: 0 } };

  const repo = await repositorio();
  const [sessoes, { linhas, totais }] = await Promise.all([
    repo.listarSessoesAtivas(),
    // Interna de propósito: o vendedor pode ver a trajetória de uma OS que ele
    // digitou, que é o trabalho dele, sem poder puxar o histórico inteiro.
    consultaInterna({ osExata: os }),
  ]);

  return { os, sessao: sessoes.find((s) => s.numero_os === os) ?? null, linhas, totais };
}

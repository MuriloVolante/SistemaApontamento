"use server";

import { repositorio } from "@/lib/repositorio";
import type {
  FiltroConsulta,
  LinhaSintetico,
  ResultadoConsulta,
  Totais,
} from "@/lib/tipos";

/** Linhas da tabela do painel e os três totais, sempre sob os mesmos filtros. */
export async function consultarApontamentos(f: FiltroConsulta): Promise<ResultadoConsulta> {
  const linhas = await (await repositorio()).consultarApontamentos(f);

  const totais: Totais = { total: 0, operacao: 0, pausa: 0 };
  for (const l of linhas) {
    totais.total += l.duracao_segundos;
    if (l.tipo === "OPERACAO") totais.operacao += l.duracao_segundos;
    else totais.pausa += l.duracao_segundos;
  }

  return { linhas, totais };
}

/** Tempo total, em operação e em pausa por etapa, para o relatório sintético. */
export async function relatorioSintetico(f: FiltroConsulta): Promise<LinhaSintetico[]> {
  const { linhas } = await consultarApontamentos(f);

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

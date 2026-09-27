import writeXlsxFile from "write-excel-file/browser";
import type { Row } from "write-excel-file/browser";
import { carimbo } from "./tempo";
import type { LinhaApontamento, LinhaSintetico } from "./tipos";

/**
 * Relatórios em Excel: só a tabela, com a linha de títulos das colunas e os
 * dados. Sem título, logotipo nem filtros, para a planilha já nascer pronta
 * para filtrar, somar e cruzar.
 *
 * Datas, horas e durações vão como valores de data e hora do Excel, não como
 * texto: assim a planilha soma e ordena direito. A duração usa `[hh]:mm:ss`,
 * que mostra 00:08:09 e, com os colchetes, não volta a zero depois de 24
 * horas acumuladas.
 */

const FORMATO_DATA = "dd/mm/yyyy";
const FORMATO_HORA = "hh:mm:ss";
const FORMATO_DURACAO = "[hh]:mm:ss";

const SEGUNDOS_NO_DIA = 86_400;
/** O dia zero do Excel: as datas são contadas em dias a partir dele. */
const EPOCA_EXCEL = Date.UTC(1899, 11, 30);

/*
 * Data e hora no fuso de quem gera, que é o que se vê na tela do sistema: o
 * Excel não guarda fuso. A data vira o número de dias desde o dia zero do
 * Excel; a hora, a fração do dia, calculada dos segundos inteiros para não
 * carregar resíduo de conta e aparecer um segundo antes.
 */
const data = (iso: string) => {
  const d = new Date(iso);
  const dias = (Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - EPOCA_EXCEL) / 86_400_000;
  return { value: dias, type: Number, format: FORMATO_DATA };
};

const hora = (iso: string) => {
  const d = new Date(iso);
  const segundos = d.getHours() * 3600 + d.getMinutes() * 60 + d.getSeconds();
  return { value: segundos / SEGUNDOS_NO_DIA, type: Number, format: FORMATO_HORA };
};

const duracao = (segundos: number) => ({
  value: segundos / SEGUNDOS_NO_DIA,
  type: Number,
  format: FORMATO_DURACAO,
});

/** Texto sempre como texto: um número de OS como "007" não perde os zeros. */
const texto = (valor: string) => ({ value: valor, type: String });

export async function gerarExcelAnalitico(linhas: LinhaApontamento[]): Promise<void> {
  const planilha: Row[] = [
    [
      "#",
      "Número OS",
      "Etapa",
      "Tipo",
      "Data Início",
      "Hora Início",
      "Data Fim",
      "Hora Fim",
      "Tempo Total",
      "Justificativa",
    ],
    ...linhas.map((l): Row => [
      l.numero,
      texto(l.numero_os),
      texto(l.etapa_nome),
      texto(l.tipo === "OPERACAO" ? "Operação" : "Pausa"),
      data(l.inicio),
      hora(l.inicio),
      data(l.fim),
      hora(l.fim),
      duracao(l.duracao_segundos),
      texto(l.justificativa ?? ""),
    ]),
  ];

  await writeXlsxFile(planilha, {
    sheet: "Analítico",
    columns: [
      { width: 7 },
      { width: 13 },
      { width: 26 },
      { width: 11 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 12 },
      { width: 13 },
      { width: 40 },
    ],
  }).toFile(`relatorio-analitico-${carimbo()}.xlsx`);
}

export async function gerarExcelSintetico(linhas: LinhaSintetico[]): Promise<void> {
  const consolidado = linhas.reduce(
    (s, l) => ({
      total: s.total + l.total,
      operacao: s.operacao + l.operacao,
      pausa: s.pausa + l.pausa,
    }),
    { total: 0, operacao: 0, pausa: 0 }
  );

  const planilha: Row[] = [
    ["Etapa", "Tempo Total", "Tempo em Operação", "Tempo Pausado"],
    ...linhas.map((l): Row => [
      texto(l.etapa_nome),
      duracao(l.total),
      duracao(l.operacao),
      duracao(l.pausa),
    ]),
    [
      texto("TOTAL CONSOLIDADO"),
      duracao(consolidado.total),
      duracao(consolidado.operacao),
      duracao(consolidado.pausa),
    ],
  ];

  await writeXlsxFile(planilha, {
    sheet: "Sintético",
    columns: [{ width: 28 }, { width: 14 }, { width: 20 }, { width: 16 }],
  }).toFile(`relatorio-sintetico-${carimbo()}.xlsx`);
}

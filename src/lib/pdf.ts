import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import type { CellHookData } from "jspdf-autotable";
import { formatarData, formatarDuracao, formatarHora } from "./tempo";
import type { LinhaApontamento, LinhaSintetico, Totais } from "./tipos";

const GRAFITE: [number, number, number] = [51, 61, 71];
const CINZA_CLARO: [number, number, number] = [244, 246, 248];

function carimbo(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(
    d.getMinutes()
  )}`;
}

/**
 * Alinha à direita as colunas de duração em TODAS as seções da tabela.
 * `columnStyles` só vale para o corpo — sem isto o cabeçalho e o rodapé saem
 * desalinhados em relação aos números.
 */
function alinharColunas(colunasDireita: number[]) {
  return (data: CellHookData) => {
    if (colunasDireita.includes(data.column.index)) {
      data.cell.styles.halign = "right";
    }
  };
}

function cabecalho(doc: jsPDF, titulo: string, criterios: string[]): number {
  const largura = doc.internal.pageSize.getWidth();
  const emissao = new Date().toISOString();

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, 16);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(
    `Emitido em ${formatarData(emissao)} ${formatarHora(emissao)}`,
    largura - 14,
    16,
    { align: "right" }
  );

  doc.setDrawColor(120);
  doc.setLineWidth(0.4);
  doc.line(14, 19, largura - 14, 19);

  let y = 25;
  doc.setFontSize(9);
  for (const linha of criterios) {
    doc.text(linha, 14, y);
    y += 5;
  }
  return y + 2;
}

function faixaTotais(doc: jsPDF, y: number, totais: Totais): number {
  const largura = doc.internal.pageSize.getWidth();
  const caixa = (largura - 28) / 3;
  const altura = 15;

  const cartoes: Array<[string, number]> = [
    ["TEMPO TOTAL", totais.total],
    ["TEMPO EM OPERAÇÃO", totais.operacao],
    ["TEMPO EM PAUSA", totais.pausa],
  ];

  cartoes.forEach(([rotulo, segundos], i) => {
    const x = 14 + i * caixa;
    doc.setDrawColor(140);
    doc.setLineWidth(0.3);
    doc.setFillColor(...CINZA_CLARO);
    doc.rect(x, y, caixa - 3, altura, "FD");

    doc.setFontSize(7.5);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(85);
    doc.text(rotulo, x + 3.5, y + 5.5);

    doc.setFontSize(12.5);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(20);
    doc.text(formatarDuracao(segundos), x + 3.5, y + 12);
  });

  doc.setTextColor(20);
  return y + altura + 6;
}

function rodapePaginas(doc: jsPDF): void {
  const p = doc.internal.pageSize;
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(120);
  doc.text(`Página ${doc.getNumberOfPages()}`, p.getWidth() - 14, p.getHeight() - 8, {
    align: "right",
  });
  doc.setTextColor(20);
}

/** Relatório analítico: espelho exato da tabela filtrada. */
export function gerarPdfAnalitico(
  linhas: LinhaApontamento[],
  totais: Totais,
  criterios: string[]
): void {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let y = cabecalho(doc, "Relatório Analítico de Apontamentos", criterios);
  y = faixaTotais(doc, y, totais);

  autoTable(doc, {
    startY: y,
    head: [
      [
        "#",
        "Número OS",
        "Etapa",
        "Tipo",
        "Data",
        "Hora Início",
        "Hora Fim",
        "Tempo Total",
        "Justificativa",
      ],
    ],
    body: linhas.map((l, i) => [
      String(i + 1),
      l.numero_os,
      l.etapa_nome,
      l.tipo === "OPERACAO" ? "Operação" : "Pausa",
      formatarData(l.inicio),
      formatarHora(l.inicio),
      formatarHora(l.fim),
      formatarDuracao(l.duracao_segundos),
      l.justificativa ?? "",
    ]),
    theme: "grid",
    styles: {
      fontSize: 8,
      cellPadding: 1.8,
      overflow: "linebreak",
      lineColor: [180, 188, 196],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: GRAFITE, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: CINZA_CLARO },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 26 },
      2: { cellWidth: 38 },
      3: { cellWidth: 20 },
      4: { cellWidth: 22 },
      5: { cellWidth: 24 },
      6: { cellWidth: 24 },
      7: { cellWidth: 26 },
      8: { cellWidth: "auto" },
    },
    didParseCell: alinharColunas([0, 5, 6, 7]),
    didDrawPage: () => rodapePaginas(doc),
  });

  doc.save(`relatorio-analitico-${carimbo()}.pdf`);
}

/**
 * Relatório sintético: por etapa, tempo total, em operação e pausado, com
 * linha de total consolidado.
 */
export function gerarPdfSintetico(linhas: LinhaSintetico[], criterios: string[]): void {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const y = cabecalho(doc, "Relatório Sintético por Etapa", criterios);

  const consolidado = linhas.reduce(
    (s, l) => ({
      total: s.total + l.total,
      operacao: s.operacao + l.operacao,
      pausa: s.pausa + l.pausa,
    }),
    { total: 0, operacao: 0, pausa: 0 }
  );

  autoTable(doc, {
    startY: y,
    head: [["Etapa", "Tempo Total", "Tempo em Operação", "Tempo Pausado"]],
    body: linhas.map((l) => [
      l.etapa_nome,
      formatarDuracao(l.total),
      formatarDuracao(l.operacao),
      formatarDuracao(l.pausa),
    ]),
    foot: [
      [
        "TOTAL CONSOLIDADO",
        formatarDuracao(consolidado.total),
        formatarDuracao(consolidado.operacao),
        formatarDuracao(consolidado.pausa),
      ],
    ],
    theme: "grid",
    styles: {
      fontSize: 9.5,
      cellPadding: 2.4,
      lineColor: [180, 188, 196],
      lineWidth: 0.1,
    },
    headStyles: { fillColor: GRAFITE, textColor: 255, fontStyle: "bold" },
    footStyles: {
      fillColor: [225, 230, 235],
      textColor: 20,
      fontStyle: "bold",
      lineColor: [140, 148, 156],
      lineWidth: 0.2,
    },
    alternateRowStyles: { fillColor: CINZA_CLARO },
    // Larguras iguais nas três colunas de duração para os números ficarem
    // exatamente sob o respectivo cabeçalho.
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 40 },
      2: { cellWidth: 40 },
      3: { cellWidth: 40 },
    },
    didParseCell: alinharColunas([1, 2, 3]),
    didDrawPage: () => rodapePaginas(doc),
  });

  doc.save(`relatorio-sintetico-${carimbo()}.pdf`);
}

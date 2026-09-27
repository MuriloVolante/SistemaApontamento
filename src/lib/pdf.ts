import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CellHookData } from "jspdf-autotable";
import { LOGOTIPO } from "./marca";
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
 * `columnStyles` só vale para o corpo, e sem isto o cabeçalho e o rodapé saem
 * desalinhados em relação aos números.
 */
function alinharColunas(colunasDireita: number[]) {
  return (data: CellHookData) => {
    if (colunasDireita.includes(data.column.index)) {
      data.cell.styles.halign = "right";
    }
  };
}

/** Logotipo pronto para o PDF: imagem PNG e a proporção do desenho. */
interface Logotipo {
  png: string;
  proporcao: number;
}

/**
 * O jsPDF não desenha SVG, então o logotipo é rasterizado num canvas, em
 * resolução folgada para sair nítido na impressão. Se o navegador falhar
 * nisso, o relatório sai sem a marca em vez de não sair.
 */
async function rasterizarLogotipo(): Promise<Logotipo | null> {
  try {
    const [, , w, h] = LOGOTIPO.viewBox.split(" ").map(Number);
    const escala = 4;
    const cor = `rgb(${GRAFITE.join(",")})`;
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${LOGOTIPO.viewBox}" ` +
      `width="${w * escala}" height="${h * escala}" fill="${cor}">` +
      LOGOTIPO.caminhos.map((d) => `<path fill-rule="evenodd" d="${d}"/>`).join("") +
      `</svg>`;

    const imagem = new Image();
    imagem.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    await imagem.decode();

    const canvas = document.createElement("canvas");
    canvas.width = w * escala;
    canvas.height = h * escala;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(imagem, 0, 0);
    return { png: canvas.toDataURL("image/png"), proporcao: w / h };
  } catch {
    return null;
  }
}

function cabecalho(
  doc: jsPDF,
  titulo: string,
  criterios: string[],
  logotipo: Logotipo | null
): number {
  const largura = doc.internal.pageSize.getWidth();
  const emissao = new Date().toISOString();

  doc.setProperties({ title: titulo, creator: "Mautus" });

  doc.setFontSize(15);
  doc.setFont("helvetica", "bold");
  doc.text(titulo, 14, 16);

  // A marca ocupa o canto direito da linha do título; a data de emissão desce
  // para a primeira linha dos critérios, do lado oposto a eles.
  if (logotipo) {
    const altura = 8;
    const comprimento = altura * logotipo.proporcao;
    doc.addImage(logotipo.png, "PNG", largura - 14 - comprimento, 9.5, comprimento, altura);
  }

  doc.setDrawColor(120);
  doc.setLineWidth(0.4);
  doc.line(14, 19.5, largura - 14, 19.5);

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.text(`Emitido em ${formatarData(emissao)} ${formatarHora(emissao)}`, largura - 14, 25, {
    align: "right",
  });

  let y = 25;
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
export async function gerarPdfAnalitico(
  linhas: LinhaApontamento[],
  totais: Totais,
  criterios: string[]
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });

  let y = cabecalho(
    doc,
    "Relatório Analítico de Apontamentos",
    criterios,
    await rasterizarLogotipo()
  );
  y = faixaTotais(doc, y, totais);

  autoTable(doc, {
    startY: y,
    head: [
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
    ],
    body: linhas.map((l) => [
      // "#" e o sequencial do registro, o mesmo que aparece na tela.
      String(l.numero),
      l.numero_os,
      l.etapa_nome,
      l.tipo === "OPERACAO" ? "Operação" : "Pausa",
      formatarData(l.inicio),
      formatarHora(l.inicio),
      // Um segmento pode atravessar a meia-noite: começa num dia e termina no outro.
      formatarData(l.fim),
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
    // A coluna nova de data saiu das folgas das outras, para a justificativa
    // continuar com espaço de texto na folha deitada.
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 24 },
      2: { cellWidth: 36 },
      3: { cellWidth: 19 },
      4: { cellWidth: 21 },
      5: { cellWidth: 20 },
      6: { cellWidth: 21 },
      7: { cellWidth: 20 },
      8: { cellWidth: 26 },
      9: { cellWidth: "auto" },
    },
    didParseCell: alinharColunas([0, 5, 7, 8]),
    didDrawPage: () => rodapePaginas(doc),
  });

  doc.save(`relatorio-analitico-${carimbo()}.pdf`);
}

/**
 * Relatório sintético: por etapa, tempo total, em operação e pausado, com
 * linha de total consolidado.
 */
export async function gerarPdfSintetico(
  linhas: LinhaSintetico[],
  criterios: string[]
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });

  const y = cabecalho(
    doc,
    "Relatório Sintético por Etapa",
    criterios,
    await rasterizarLogotipo()
  );

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

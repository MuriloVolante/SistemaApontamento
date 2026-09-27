import jsPDF from "jspdf";
import { autoTable } from "jspdf-autotable";
import type { CellHookData } from "jspdf-autotable";
import { LOGOTIPO } from "./marca";
import { carimbo, formatarData, formatarDuracao, formatarHora } from "./tempo";
import type { LinhaApontamento, LinhaSintetico, Totais } from "./tipos";

/**
 * Relatórios em PDF, no desenho dos modelos aprovados (sintético v2 e
 * analítico v3). As medidas estão em pontos, a unidade do próprio PDF, e
 * foram tiradas dos modelos: por isso a folha é criada em "pt".
 */

type Cor = [number, number, number];

const COR = {
  titulo: [17, 17, 17] as Cor,
  rotulo: [68, 68, 68] as Cor,
  icone: [52, 58, 68] as Cor,
  borda: [153, 153, 153] as Cor,
  caixa: [247, 247, 247] as Cor,
  divisor: [212, 216, 222] as Cor,
  cabecalho: [52, 58, 68] as Cor,
  zebra: [244, 245, 247] as Cor,
  total: [227, 230, 234] as Cor,
  rodape: [52, 52, 52] as Cor,
};

/** Filtros do relatório, como o diálogo os escolheu. Datas em AAAA-MM-DD. */
export interface CriteriosRelatorio {
  de: string;
  ate: string;
  os: string;
  etapa: string;
  tipo: string;
}

const dataCurta = (dia: string) => formatarData(`${dia}T12:00:00`);

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
    const cor = `rgb(${COR.icone.join(",")})`;
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

// ---------------------------------------------------------------------------
// Ícones da caixa de filtros
// ---------------------------------------------------------------------------

type Desenho = (doc: jsPDF, x: number, y: number) => void;

/**
 * Os mesmos ícones de linha dos modelos, desenhados em traço, numa caixa de
 * 11 pt com o canto de cima à esquerda em (x, y).
 */
const ICONES: Record<"periodo" | "os" | "etapa" | "tipo" | "registros", Desenho> = {
  periodo: (doc, x, y) => {
    doc.roundedRect(x, y + 1.3, 10.6, 9.7, 1.6, 1.6, "S");
    doc.line(x, y + 4.6, x + 10.6, y + 4.6);
    doc.line(x + 3, y, x + 3, y + 2.6);
    doc.line(x + 7.6, y, x + 7.6, y + 2.6);
  },
  os: (doc, x, y) => {
    doc.roundedRect(x + 1, y, 8.8, 11.2, 1.4, 1.4, "S");
    doc.line(x + 3.3, y + 5.4, x + 7.5, y + 5.4);
    doc.line(x + 3.3, y + 8, x + 7.5, y + 8);
  },
  etapa: (doc, x, y) => {
    doc.lines([[5.6, 2.8], [5.6, -2.8], [-5.6, -2.8], [-5.6, 2.8]], x, y + 2.8, [1, 1], "S", true);
    doc.lines([[5.6, 2.8], [5.6, -2.8]], x, y + 5.6, [1, 1], "S");
    doc.lines([[5.6, 2.8], [5.6, -2.8]], x, y + 8.4, [1, 1], "S");
  },
  tipo: (doc, x, y) => {
    doc.lines(
      [[4.6, 0], [5.8, 5.8], [-4.7, 4.7], [-5.7, -5.7]],
      x + 0.2,
      y + 0.2,
      [1, 1],
      "S",
      true
    );
    doc.circle(x + 3, y + 3, 0.8, "F");
  },
  registros: (doc, x, y) => {
    for (const dy of [2.2, 5.5, 8.8]) {
      doc.circle(x + 0.7, y + dy, 0.6, "F");
      doc.line(x + 3.2, y + dy, x + 10.6, y + dy);
    }
  },
};

// ---------------------------------------------------------------------------
// Cabeçalho, filtros e totais
// ---------------------------------------------------------------------------

/** Encurta o texto com reticências até caber na largura. */
function caber(doc: jsPDF, texto: string, largura: number): string {
  if (doc.getTextWidth(texto) <= largura) return texto;
  let t = texto;
  while (t.length > 1 && doc.getTextWidth(`${t}…`) > largura) t = t.slice(0, -1);
  return `${t.trimEnd()}…`;
}

function cabecalho(doc: jsPDF, titulo: string, margem: number, logotipo: Logotipo | null): number {
  const largura = doc.internal.pageSize.getWidth();
  const emissao = new Date().toISOString();

  doc.setProperties({ title: titulo, creator: "Mautus" });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12.75);
  doc.setTextColor(...COR.titulo);
  doc.text(titulo, margem, margem + 14.5);

  if (logotipo) {
    const altura = 22.5;
    const comprimento = altura * logotipo.proporcao;
    doc.addImage(logotipo.png, "PNG", largura - margem - comprimento, margem, comprimento, altura);
  }

  doc.setFillColor(...COR.borda);
  doc.rect(margem, margem + 27, largura - 2 * margem, 0.7, "F");

  doc.setFont("helvetica", "normal");
  doc.setFontSize(6.75);
  doc.text(
    `Emitido em ${formatarData(emissao)} ${formatarHora(emissao)}`,
    largura - margem,
    margem + 38.5,
    { align: "right" }
  );

  return margem + 49;
}

interface Celula {
  icone: keyof typeof ICONES;
  rotulo: string;
  valor: string;
  /** Período com as duas datas: o valor sai como "de → até", com a seta desenhada. */
  seta?: [string, string];
  /** Parte da largura da caixa que a célula ocupa no modelo. */
  peso: number;
}

const ALTURA_FILTROS = 32.2;
const TEXTO_NA_CELULA = 27.5;

/**
 * Larguras das células: a proporção do modelo, mas nenhuma menor que o seu
 * conteúdo. O que falta a uma célula sai da folga das outras.
 */
function largurasDasCelulas(doc: jsPDF, celulas: Celula[], total: number): number[] {
  const peso = celulas.reduce((s, c) => s + c.peso, 0);
  const larguras = celulas.map((c) => (c.peso / peso) * total);
  const precisa = celulas.map((c) => {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    const rotulo = doc.getTextWidth(c.rotulo.toUpperCase());
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    const valor = c.seta
      ? doc.getTextWidth(c.seta[0]) + doc.getTextWidth(c.seta[1]) + 15
      : doc.getTextWidth(c.valor);
    return TEXTO_NA_CELULA + Math.max(rotulo, valor) + 8;
  });

  const falta = larguras.reduce((s, w, i) => s + Math.max(0, precisa[i] - w), 0);
  const folga = larguras.reduce((s, w, i) => s + Math.max(0, w - precisa[i]), 0);
  if (falta === 0) return larguras;

  // Quem sobra cede na proporção da própria folga; se nem assim couber, o
  // texto é encurtado na hora de escrever.
  const cede = Math.min(1, falta / (folga || 1));
  return larguras.map((w, i) =>
    precisa[i] > w
      ? w + (precisa[i] - w) * Math.min(1, folga / falta)
      : w - (w - precisa[i]) * cede
  );
}

function caixaDeFiltros(doc: jsPDF, y: number, margem: number, celulas: Celula[]): number {
  const total = doc.internal.pageSize.getWidth() - 2 * margem;
  const larguras = largurasDasCelulas(doc, celulas, total);

  doc.setLineWidth(0.75);
  doc.setDrawColor(...COR.borda);
  doc.setFillColor(...COR.caixa);
  doc.roundedRect(margem, y, total, ALTURA_FILTROS, 3, 3, "FD");

  let x = margem;
  celulas.forEach((c, i) => {
    const largura = larguras[i];

    if (i > 0) {
      doc.setFillColor(...COR.divisor);
      doc.rect(x - 0.35, y + 0.4, 0.7, ALTURA_FILTROS - 0.8, "F");
    }

    doc.setDrawColor(...COR.icone);
    doc.setFillColor(...COR.icone);
    doc.setLineWidth(0.9);
    doc.setLineCap("round");
    doc.setLineJoin("round");
    ICONES[c.icone](doc, x + 10, y + ALTURA_FILTROS / 2 - 5.5);
    doc.setLineCap("butt");
    doc.setLineJoin("miter");

    const tx = x + TEXTO_NA_CELULA;
    const espaco = largura - TEXTO_NA_CELULA - 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...COR.rotulo);
    doc.text(caber(doc, c.rotulo.toUpperCase(), espaco), tx, y + 11.4);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...COR.titulo);
    const base = y + 23.4;
    if (c.seta) {
      // A fonte do PDF não tem o caractere da seta: ela é desenhada.
      const [de, ate] = c.seta;
      doc.text(de, tx, base);
      const x1 = tx + doc.getTextWidth(de) + 3.5;
      const x2 = x1 + 8;
      const meio = base - 3;
      doc.setDrawColor(...COR.titulo);
      doc.setLineWidth(0.8);
      doc.line(x1, meio, x2, meio);
      doc.line(x2 - 2.4, meio - 2, x2, meio);
      doc.line(x2 - 2.4, meio + 2, x2, meio);
      doc.text(ate, x2 + 3.5, base);
    } else {
      doc.text(caber(doc, c.valor, espaco), tx, base);
    }

    x += largura;
  });

  return y + ALTURA_FILTROS;
}

/** As células de filtro comuns aos dois relatórios. */
function celulasDosCriterios(c: CriteriosRelatorio, pesos: number[]): Celula[] {
  let periodo: Pick<Celula, "valor" | "seta">;
  if (c.de && c.ate && c.de !== c.ate) periodo = { valor: "", seta: [dataCurta(c.de), dataCurta(c.ate)] };
  else if (c.de && c.ate) periodo = { valor: dataCurta(c.de) };
  else if (c.de) periodo = { valor: `desde ${dataCurta(c.de)}` };
  else if (c.ate) periodo = { valor: `até ${dataCurta(c.ate)}` };
  else periodo = { valor: "Todo o período" };

  const os = c.os.trim();
  return [
    { icone: "periodo", rotulo: "Período", ...periodo, peso: pesos[0] },
    { icone: "os", rotulo: "Ordem de serviço", valor: os ? `contém ${os}` : "Todas", peso: pesos[1] },
    { icone: "etapa", rotulo: "Etapa", valor: c.etapa, peso: pesos[2] },
    { icone: "tipo", rotulo: "Tipo", valor: c.tipo, peso: pesos[3] },
  ];
}

function cartoesDeTotais(doc: jsPDF, y: number, margem: number, totais: Totais): number {
  const vao = 9.8;
  const altura = 36.7;
  const largura = (doc.internal.pageSize.getWidth() - 2 * margem - 2 * vao) / 3;

  const cartoes: Array<[string, number]> = [
    ["TEMPO TOTAL", totais.total],
    ["TEMPO EM OPERAÇÃO", totais.operacao],
    ["TEMPO EM PAUSA", totais.pausa],
  ];

  cartoes.forEach(([rotulo, segundos], i) => {
    const x = margem + i * (largura + vao);
    doc.setLineWidth(0.75);
    doc.setDrawColor(...COR.borda);
    doc.setFillColor(...COR.caixa);
    doc.roundedRect(x, y, largura, altura, 3, 3, "FD");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(6);
    doc.setTextColor(...COR.rotulo);
    doc.text(rotulo, x + 7.9, y + 12.1);

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.setTextColor(...COR.titulo);
    doc.text(formatarDuracao(segundos), x + 7.9, y + 28.1);
  });

  return y + altura;
}

function rodapePaginas(doc: jsPDF, margem: number): void {
  const p = doc.internal.pageSize;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(6);
  doc.setTextColor(...COR.rodape);
  doc.text(`Página ${doc.getNumberOfPages()}`, p.getWidth() - margem, p.getHeight() - (margem - 12.5), {
    align: "right",
  });
}

/**
 * Alinhamento de cada coluna em TODAS as seções da tabela. `columnStyles` só
 * vale para o corpo, e sem isto o cabeçalho e o rodapé saem desalinhados em
 * relação aos valores.
 */
function alinhar(colunas: Record<number, "right" | "center">) {
  return (data: CellHookData) => {
    const lado = colunas[data.column.index];
    if (lado) data.cell.styles.halign = lado;
  };
}

// ---------------------------------------------------------------------------
// Relatórios
// ---------------------------------------------------------------------------

/** Relatório analítico: espelho exato da tabela filtrada. */
export async function gerarPdfAnalitico(
  linhas: LinhaApontamento[],
  totais: Totais,
  criterios: CriteriosRelatorio
): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "pt", format: "a4" });
  const margem = 33.7;

  let y = cabecalho(doc, "Relatório Analítico de Apontamentos", margem, await rasterizarLogotipo());

  const registros = `${linhas.length} ${linhas.length === 1 ? "apontamento" : "apontamentos"}`;
  y = caixaDeFiltros(doc, y, margem, [
    ...celulasDosCriterios(criterios, [231.7, 161.2, 102.7, 102.7]),
    { icone: "registros", rotulo: "Registros", valor: registros, peso: 174 },
  ]);
  y = cartoesDeTotais(doc, y + 9.8, margem, totais);

  autoTable(doc, {
    startY: y + 12.4,
    margin: { top: margem, right: margem, bottom: margem + 4, left: margem },
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
      // "#" é o sequencial do registro, o mesmo que aparece na tela.
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
      font: "helvetica",
      fontSize: 6.375,
      textColor: [51, 51, 51],
      cellPadding: { top: 4.2, bottom: 4.2, left: 4.5, right: 4.5 },
      minCellHeight: 15.7,
      valign: "middle",
      overflow: "linebreak",
      lineColor: COR.divisor,
      lineWidth: 0.7,
    },
    headStyles: { fillColor: COR.cabecalho, textColor: 255, fontStyle: "bold" },
    // O zebrado começa na primeira linha, como no modelo. No AutoTable o
    // estilo "alternado" é o das linhas pares, a começar pela primeira.
    bodyStyles: { fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: COR.zebra },
    columnStyles: {
      0: { cellWidth: 21 },
      1: { cellWidth: 69.7 },
      2: { cellWidth: 119.2 },
      3: { cellWidth: 60.7 },
      4: { cellWidth: 66 },
      5: { cellWidth: 66.7 },
      6: { cellWidth: 66.7 },
      7: { cellWidth: 58.5 },
      8: { cellWidth: 74.2 },
      9: { cellWidth: "auto" },
    },
    didParseCell: alinhar({ 0: "right", 5: "right", 7: "right", 8: "center" }),
    didDrawPage: () => rodapePaginas(doc, margem),
  });

  doc.save(`relatorio-analitico-${carimbo()}.pdf`);
}

/**
 * Relatório sintético: por etapa, tempo total, em operação e pausado, com
 * linha de total consolidado.
 */
export async function gerarPdfSintetico(
  linhas: LinhaSintetico[],
  criterios: CriteriosRelatorio
): Promise<void> {
  const doc = new jsPDF({ orientation: "portrait", unit: "pt", format: "a4" });
  const margem = 28.5;

  let y = cabecalho(doc, "Relatório Sintético por Etapa", margem, await rasterizarLogotipo());
  y = caixaDeFiltros(doc, y, margem, celulasDosCriterios(criterios, [183, 156, 99.7, 99]));

  const consolidado = linhas.reduce(
    (s, l) => ({
      total: s.total + l.total,
      operacao: s.operacao + l.operacao,
      pausa: s.pausa + l.pausa,
    }),
    { total: 0, operacao: 0, pausa: 0 }
  );

  autoTable(doc, {
    startY: y + 10.9,
    margin: { top: margem, right: margem, bottom: margem + 4, left: margem },
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
    // O total fecha a tabela uma vez só, no fim, e não em cada página.
    showFoot: "lastPage",
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 6.75,
      textColor: COR.rotulo,
      cellPadding: { top: 5.4, bottom: 5.4, left: 6.75, right: 6.75 },
      minCellHeight: 18.7,
      valign: "middle",
      lineColor: [201, 206, 214],
      lineWidth: 0.7,
    },
    headStyles: { fillColor: COR.cabecalho, textColor: 255, fontStyle: "bold" },
    bodyStyles: { fillColor: [255, 255, 255] },
    alternateRowStyles: { fillColor: COR.zebra },
    footStyles: { fillColor: COR.total, textColor: COR.titulo, fontStyle: "bold" },
    // Larguras iguais nas três colunas de duração para os números ficarem
    // exatamente sob o respectivo cabeçalho.
    columnStyles: {
      0: { cellWidth: "auto" },
      1: { cellWidth: 118.5 },
      2: { cellWidth: 118.5 },
      3: { cellWidth: 118.5 },
    },
    didParseCell: alinhar({ 1: "right", 2: "right", 3: "right" }),
    didDrawPage: () => rodapePaginas(doc, margem),
  });

  doc.save(`relatorio-sintetico-${carimbo()}.pdf`);
}

"use client";

import Icone from "@/components/Icone";
import type { NomeIcone } from "@/components/Icone";
import { formatarDuracao } from "@/lib/tempo";
import type { Tipo, Totais } from "@/lib/tipos";

/** `null` no recorte significa "todos os tipos". */
export type Recorte = Tipo | null;

interface Props {
  totais: Totais;
  /** Quando informado, os cards viram filtro: clicar recorta a tabela. */
  recorte?: Recorte;
  aoRecortar?: (novo: Recorte) => void;
  /** Mostra a fatia de ociosidade sob o card de pausa. */
  mostrarPercentualPausa?: boolean;
}

const CARDS: Array<{
  chave: Recorte;
  rotulo: string;
  icone: NomeIcone;
  classe: string;
  valor: (t: Totais) => number;
}> = [
  {
    chave: null,
    rotulo: "Tempo Total",
    icone: "relogio",
    classe: "total-cartao--total",
    valor: (t) => t.total,
  },
  {
    chave: "OPERACAO",
    rotulo: "Tempo em Operação",
    icone: "operacao",
    classe: "total-cartao--operacao",
    valor: (t) => t.operacao,
  },
  {
    chave: "PAUSA",
    rotulo: "Tempo em Pausa",
    icone: "pausa",
    classe: "total-cartao--pausa",
    valor: (t) => t.pausa,
  },
];

/**
 * Os três cards de tempo, compartilhados entre Dashboard e Histórico.
 * No Histórico eles também são o filtro por tipo: clicar recorta a tabela,
 * clicar de novo desfaz.
 */
export default function CardsTotais({
  totais,
  recorte,
  aoRecortar,
  mostrarPercentualPausa = false,
}: Props) {
  const clicavel = typeof aoRecortar === "function";
  const percentualPausa =
    totais.total > 0 ? Math.round((totais.pausa / totais.total) * 100) : 0;

  return (
    <div className="totais">
      {CARDS.map((c) => {
        const ativo = clicavel && recorte === c.chave && c.chave !== null;
        // "Tempo Total" acende quando nenhum recorte está aplicado.
        const aceso = clicavel && (c.chave === null ? recorte === null : ativo);

        const conteudo = (
          <>
            <span className="total-icone">
              <Icone nome={c.icone} tamanho={17} />
            </span>
            <p className="total-rotulo">{c.rotulo}</p>
            <p className="total-valor">{formatarDuracao(c.valor(totais))}</p>
            {mostrarPercentualPausa && c.chave === "PAUSA" && (
              <p className="total-extra">{percentualPausa}% do tempo</p>
            )}
          </>
        );

        const classes = `total-cartao ${c.classe} ${aceso ? "total-cartao--aceso" : ""}`;

        if (!clicavel) {
          return (
            <div key={c.rotulo} className={classes}>
              {conteudo}
            </div>
          );
        }

        return (
          <button
            key={c.rotulo}
            type="button"
            className={`${classes} total-cartao--clicavel`}
            aria-pressed={aceso}
            // Clicar no card já marcado desliga o recorte.
            onClick={() => aoRecortar?.(recorte === c.chave ? null : c.chave)}
          >
            {conteudo}
          </button>
        );
      })}
    </div>
  );
}

"use client";

import { formatarDuracao } from "@/lib/tempo";
import type { Totais } from "@/lib/tipos";

/** Os três cards de tempo, compartilhados entre Dashboard e Histórico. */
export default function CardsTotais({ totais }: { totais: Totais }) {
  return (
    <div className="totais">
      <div className="total-cartao total-cartao--total">
        <p className="total-rotulo">Tempo Total</p>
        <p className="total-valor">{formatarDuracao(totais.total)}</p>
      </div>
      <div className="total-cartao total-cartao--operacao">
        <p className="total-rotulo">Tempo em Operação</p>
        <p className="total-valor">{formatarDuracao(totais.operacao)}</p>
      </div>
      <div className="total-cartao total-cartao--pausa">
        <p className="total-rotulo">Tempo em Pausa</p>
        <p className="total-valor">{formatarDuracao(totais.pausa)}</p>
      </div>
    </div>
  );
}

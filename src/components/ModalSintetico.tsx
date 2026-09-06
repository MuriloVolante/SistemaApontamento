"use client";

import { useState } from "react";
import { relatorioSintetico } from "@/app/consultas";
import { gerarPdfSintetico } from "@/lib/pdf";
import { formatarData, limitesLocais } from "@/lib/tempo";
import type { Etapa } from "@/lib/tipos";

interface Props {
  etapas: Etapa[];
  filtrosAtuais: { os: string; etapaId: string; data: string };
  aoFechar: () => void;
}

/**
 * Parâmetros do relatório sintético. Vem pré-preenchido com os filtros que já
 * estão na tela, para que o total do PDF bata com o card Tempo Total.
 */
export default function ModalSintetico({ etapas, filtrosAtuais, aoFechar }: Props) {
  const [dataInicio, setDataInicio] = useState(filtrosAtuais.data);
  const [dataFim, setDataFim] = useState(filtrosAtuais.data);
  const [os, setOs] = useState(filtrosAtuais.os);
  const [etapaId, setEtapaId] = useState(filtrosAtuais.etapaId);
  const [gerando, setGerando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function gerar() {
    setGerando(true);
    setErro(null);
    try {
      const { deISO, ateISO } = limitesLocais(dataInicio || undefined, dataFim || undefined);
      const linhas = await relatorioSintetico({ os, etapaId, deISO, ateISO });

      if (linhas.length === 0) {
        setErro("Nenhum apontamento para os parâmetros informados.");
        return;
      }

      const nomeEtapa = etapas.find((e) => e.id === etapaId)?.nome ?? "Todas";
      const periodo =
        dataInicio || dataFim
          ? `${dataInicio ? formatarData(`${dataInicio}T12:00:00`) : "início"} a ${
              dataFim ? formatarData(`${dataFim}T12:00:00`) : "hoje"
            }`
          : "Todo o período";

      gerarPdfSintetico(linhas, [
        `Período: ${periodo}`,
        `OS: ${os.trim() ? `contém "${os.trim()}"` : "todas"}   |   Etapa: ${nomeEtapa}`,
      ]);
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando(false);
    }
  }

  return (
    <div className="modal-fundo" role="dialog" aria-modal="true">
      <div className="modal-caixa">
        <h2 className="modal-titulo" style={{ fontSize: "1.4rem" }}>
          Relatório Sintético
        </h2>

        <div className="filtros">
          <div>
            <label className="campo-rotulo" htmlFor="s-inicio">
              Data Início
            </label>
            <input
              id="s-inicio"
              className="campo"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>
          <div>
            <label className="campo-rotulo" htmlFor="s-fim">
              Data Fim
            </label>
            <input
              id="s-fim"
              className="campo"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>
          <div>
            <label className="campo-rotulo" htmlFor="s-os">
              OS
            </label>
            <input
              id="s-os"
              className="campo"
              type="text"
              placeholder="Busca parcial"
              value={os}
              onChange={(e) => setOs(e.target.value)}
            />
          </div>
          <div>
            <label className="campo-rotulo" htmlFor="s-etapa">
              Etapa
            </label>
            <select
              id="s-etapa"
              className="campo"
              value={etapaId}
              onChange={(e) => setEtapaId(e.target.value)}
            >
              <option value="">Todas</option>
              {etapas.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                  {e.ativa ? "" : " (inativa)"}
                </option>
              ))}
            </select>
          </div>
        </div>

        {erro && <p className="erro">{erro}</p>}

        <div className="linha-acoes" style={{ marginTop: 20, justifyContent: "flex-end" }}>
          <button type="button" className="botao botao--neutro" onClick={aoFechar}>
            Cancelar
          </button>
          <button type="button" className="botao" onClick={gerar} disabled={gerando}>
            {gerando ? "Gerando…" : "Gerar PDF"}
          </button>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import Icone from "@/components/Icone";
import Dica from "@/components/Dica";
import { consultarApontamentos, relatorioSintetico } from "../../consultas";
import { gerarPdfAnalitico, gerarPdfSintetico } from "@/lib/pdf";
import { formatarData, limitesLocais } from "@/lib/tempo";
import type { Tipo } from "@/lib/tipos";

interface Props {
  /** Filtros que já estão valendo na tela, herdados sem redigitar. */
  herdado: { os: string; etapaId: string; nomeEtapa: string; tipo: "" | Tipo };
  aoFechar: () => void;
}

const ROTULO_TIPO: Record<string, string> = {
  "": "Todos",
  OPERACAO: "Operação",
  PAUSA: "Pausa",
};

export default function ModalRelatorio({ herdado, aoFechar }: Props) {
  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [gerando, setGerando] = useState<"" | "ANALITICO" | "SINTETICO">("");
  const [erro, setErro] = useState<string | null>(null);

  function filtro() {
    const { deISO, ateISO } = limitesLocais(dataInicio || undefined, dataFim || undefined);
    return { os: herdado.os, etapaId: herdado.etapaId, tipo: herdado.tipo, deISO, ateISO };
  }

  function criterios(): string[] {
    const periodo =
      dataInicio || dataFim
        ? `${dataInicio ? formatarData(`${dataInicio}T12:00:00`) : "início"} a ${
            dataFim ? formatarData(`${dataFim}T12:00:00`) : "hoje"
          }`
        : "Todo o período";

    return [
      `Período: ${periodo}`,
      `OS: ${herdado.os.trim() ? `contém "${herdado.os.trim()}"` : "todas"}   |   Etapa: ${
        herdado.nomeEtapa
      }   |   Tipo: ${ROTULO_TIPO[herdado.tipo]}`,
    ];
  }

  async function gerar(qual: "ANALITICO" | "SINTETICO") {
    setGerando(qual);
    setErro(null);
    try {
      if (qual === "ANALITICO") {
        const { linhas, totais } = await consultarApontamentos(filtro());
        if (linhas.length === 0) {
          setErro("Não há nada gravado com esses filtros. Tente outras datas.");
          return;
        }
        gerarPdfAnalitico(linhas, totais, [...criterios(), `Registros: ${linhas.length}`]);
      } else {
        const linhas = await relatorioSintetico(filtro());
        if (linhas.length === 0) {
          setErro("Não há nada gravado com esses filtros. Tente outras datas.");
          return;
        }
        gerarPdfSintetico(linhas, criterios());
      }
      aoFechar();
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando("");
    }
  }

  const ocupado = gerando !== "";

  return (
    <Modal titulo="Gerar relatório em PDF" aoFechar={aoFechar}>
      {/* Os filtros da tela entram prontos; aqui só se escolhe o período. */}
      <div className="modal-herdado">
        <span className="modal-herdado-titulo">O que vai entrar no relatório</span>
        <div className="modal-fichas">
          <span className="ficha">
            OS: <strong>{herdado.os.trim() || "todas"}</strong>
          </span>
          <span className="ficha">
            Etapa: <strong>{herdado.nomeEtapa}</strong>
          </span>
          <span className="ficha">
            Tipo: <strong>{ROTULO_TIPO[herdado.tipo]}</strong>
          </span>
        </div>
      </div>

      <div className="modal-periodo">
        <div>
          <label className="campo-rotulo" htmlFor="rel-inicio">
            A partir de
          </label>
          <input
            id="rel-inicio"
            className="campo"
            type="date"
            value={dataInicio}
            onChange={(e) => setDataInicio(e.target.value)}
          />
        </div>
        <div>
          <label className="campo-rotulo" htmlFor="rel-fim">
            Até
          </label>
          <input
            id="rel-fim"
            className="campo"
            type="date"
            value={dataFim}
            onChange={(e) => setDataFim(e.target.value)}
          />
        </div>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <div className="modal-relatorios">
        <button
          type="button"
          className="relatorio-opcao"
          onClick={() => gerar("ANALITICO")}
          disabled={ocupado}
        >
          <span className="relatorio-opcao-icone">
            <Icone nome="relatorio" tamanho={20} />
          </span>
          <span className="relatorio-opcao-texto">
            <strong>
              {gerando === "ANALITICO" ? "Gerando…" : "Analítico"}
              {gerando !== "ANALITICO" && (
                <Dica sobre="o relatório analítico">
                  Tudo linha por linha: cada vez que a máquina rodou e cada vez que
                  parou, com hora de início, hora de fim e o motivo de cada parada. É o
                  relatório para conferir o que aconteceu.
                </Dica>
              )}
            </strong>
          </span>
        </button>

        <button
          type="button"
          className="relatorio-opcao"
          onClick={() => gerar("SINTETICO")}
          disabled={ocupado}
        >
          <span className="relatorio-opcao-icone">
            <Icone nome="etapa" tamanho={20} />
          </span>
          <span className="relatorio-opcao-texto">
            <strong>
              {gerando === "SINTETICO" ? "Gerando…" : "Sintético"}
              {gerando !== "SINTETICO" && (
                <Dica sobre="o relatório sintético">
                  Uma linha por etapa — ou seja, por máquina ou setor: o tempo total,
                  quanto tempo rodou e quanto tempo ficou parada. É o relatório para
                  bater o olho e comparar.
                </Dica>
              )}
            </strong>
          </span>
        </button>
      </div>

      <div className="modal-rodape">
        <button type="button" className="botao botao--neutro" onClick={aoFechar} disabled={ocupado}>
          Cancelar
        </button>
      </div>
    </Modal>
  );
}

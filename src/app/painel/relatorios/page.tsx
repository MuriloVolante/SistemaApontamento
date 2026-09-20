"use client";

import { useCallback, useEffect, useState } from "react";
import { listarEtapas } from "../../actions";
import { consultarApontamentos, relatorioSintetico } from "../../consultas";
import { gerarPdfAnalitico, gerarPdfSintetico } from "@/lib/pdf";
import { formatarData, limitesLocais } from "@/lib/tempo";
import type { Etapa } from "@/lib/tipos";

export default function Relatorios() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);

  const [dataInicio, setDataInicio] = useState("");
  const [dataFim, setDataFim] = useState("");
  const [os, setOs] = useState("");
  const [etapaId, setEtapaId] = useState("");

  const [gerando, setGerando] = useState<"" | "ANALITICO" | "SINTETICO">("");
  const [erro, setErro] = useState<string | null>(null);

  const carregarEtapas = useCallback(() => {
    listarEtapas(false)
      .then(setEtapas)
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregarEtapas();
  }, [carregarEtapas]);

  /** Descrição dos parâmetros, impressa no cabeçalho dos dois relatórios. */
  function criterios(): string[] {
    const nomeEtapa = etapas.find((e) => e.id === etapaId)?.nome ?? "Todas";
    const periodo =
      dataInicio || dataFim
        ? `${dataInicio ? formatarData(`${dataInicio}T12:00:00`) : "início"} a ${
            dataFim ? formatarData(`${dataFim}T12:00:00`) : "hoje"
          }`
        : "Todo o período";

    return [
      `Período: ${periodo}`,
      `OS: ${os.trim() ? `contém "${os.trim()}"` : "todas"}   |   Etapa: ${nomeEtapa}`,
    ];
  }

  function filtro() {
    const { deISO, ateISO } = limitesLocais(dataInicio || undefined, dataFim || undefined);
    return { os, etapaId, deISO, ateISO };
  }

  async function gerarAnalitico() {
    setGerando("ANALITICO");
    setErro(null);
    try {
      const { linhas, totais } = await consultarApontamentos(filtro());
      if (linhas.length === 0) {
        setErro("Nenhum apontamento para os parâmetros informados.");
        return;
      }
      gerarPdfAnalitico(linhas, totais, [...criterios(), `Registros: ${linhas.length}`]);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando("");
    }
  }

  async function gerarSintetico() {
    setGerando("SINTETICO");
    setErro(null);
    try {
      const linhas = await relatorioSintetico(filtro());
      if (linhas.length === 0) {
        setErro("Nenhum apontamento para os parâmetros informados.");
        return;
      }
      gerarPdfSintetico(linhas, criterios());
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setGerando("");
    }
  }

  function limpar() {
    setDataInicio("");
    setDataFim("");
    setOs("");
    setEtapaId("");
    setErro(null);
  }

  return (
    <>
      <div className="painel-topo">
        <h1 className="painel-titulo">Relatórios</h1>
        <span className="painel-legenda">Os dois relatórios usam os parâmetros abaixo</span>
      </div>

      <section className="cartao">
        <h2 className="cartao-titulo">Parâmetros</h2>
        <div className="filtros">
          <div>
            <label className="campo-rotulo" htmlFor="r-inicio">
              Data Início
            </label>
            <input
              id="r-inicio"
              className="campo"
              type="date"
              value={dataInicio}
              onChange={(e) => setDataInicio(e.target.value)}
            />
          </div>

          <div>
            <label className="campo-rotulo" htmlFor="r-fim">
              Data Fim
            </label>
            <input
              id="r-fim"
              className="campo"
              type="date"
              value={dataFim}
              onChange={(e) => setDataFim(e.target.value)}
            />
          </div>

          <div>
            <label className="campo-rotulo" htmlFor="r-os">
              OS
            </label>
            <input
              id="r-os"
              className="campo"
              type="text"
              placeholder="Busca parcial"
              value={os}
              onChange={(e) => setOs(e.target.value)}
            />
          </div>

          <div>
            <label className="campo-rotulo" htmlFor="r-etapa">
              Etapa
            </label>
            <select
              id="r-etapa"
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

          <div className="linha-acoes">
            <button type="button" className="botao botao--neutro" onClick={limpar}>
              Limpar
            </button>
          </div>
        </div>

        {erro && <p className="erro">{erro}</p>}
      </section>

      <div className="relatorios-grade">
        <article className="cartao relatorio-cartao">
          <h2 className="cartao-titulo">Analítico</h2>
          <p className="relatorio-texto">
            Um apontamento por linha: OS, etapa, tipo, data, horários, duração e justificativa.
            Traz os três totais no cabeçalho.
          </p>
          <button
            type="button"
            className="botao"
            onClick={gerarAnalitico}
            disabled={gerando !== ""}
          >
            {gerando === "ANALITICO" ? "Gerando…" : "Gerar relatório analítico"}
          </button>
        </article>

        <article className="cartao relatorio-cartao">
          <h2 className="cartao-titulo">Sintético</h2>
          <p className="relatorio-texto">
            Uma linha por etapa com tempo total, tempo em operação e tempo pausado, fechando com o
            total consolidado.
          </p>
          <button
            type="button"
            className="botao"
            onClick={gerarSintetico}
            disabled={gerando !== ""}
          >
            {gerando === "SINTETICO" ? "Gerando…" : "Gerar relatório sintético"}
          </button>
        </article>
      </div>
    </>
  );
}

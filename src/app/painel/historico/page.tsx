"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listarEtapas } from "../../actions";
import { consultarApontamentos } from "../../consultas";
import CardsTotais from "../Totais";
import { gerarPdfAnalitico } from "@/lib/pdf";
import { formatarData, formatarDuracao, formatarHora, limitesLocais } from "@/lib/tempo";
import type { Etapa, FiltroConsulta, LinhaApontamento, Totais } from "@/lib/tipos";

const TOTAIS_ZERADOS: Totais = { total: 0, operacao: 0, pausa: 0 };
const POR_PAGINA = 50;

export default function Historico() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);

  const [os, setOs] = useState("");
  const [etapaId, setEtapaId] = useState("");
  const [tipo, setTipo] = useState<"" | "OPERACAO" | "PAUSA">("");
  const [data, setData] = useState("");

  const [linhas, setLinhas] = useState<LinhaApontamento[]>([]);
  const [totais, setTotais] = useState<Totais>(TOTAIS_ZERADOS);
  const [pagina, setPagina] = useState(1);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const filtro: FiltroConsulta = useMemo(() => {
    const { deISO, ateISO } = limitesLocais(data || undefined, data || undefined);
    return { os, etapaId, tipo, deISO, ateISO };
  }, [os, etapaId, tipo, data]);

  const carregarEtapas = useCallback(() => {
    listarEtapas(false)
      .then(setEtapas)
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregarEtapas();
  }, [carregarEtapas]);

  // Cards e tabela vêm da mesma consulta: alterar qualquer filtro recalcula
  // os dois juntos e volta para a primeira página.
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);

    consultarApontamentos(filtro)
      .then((r) => {
        if (cancelado) return;
        setLinhas(r.linhas);
        setTotais(r.totais);
        setPagina(1);
      })
      .catch((e: Error) => {
        if (!cancelado) {
          setErro(e.message);
          setLinhas([]);
          setTotais(TOTAIS_ZERADOS);
        }
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });

    return () => {
      cancelado = true;
    };
  }, [filtro]);

  // ---- paginação (cards e PDF seguem sobre o filtro inteiro) -------------

  const totalPaginas = Math.max(1, Math.ceil(linhas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const primeiroIndice = (paginaAtual - 1) * POR_PAGINA;
  const linhasDaPagina = linhas.slice(primeiroIndice, primeiroIndice + POR_PAGINA);

  const nomeEtapaFiltro = etapas.find((e) => e.id === etapaId)?.nome ?? "Todas";

  function limparFiltros() {
    setOs("");
    setEtapaId("");
    setTipo("");
    setData("");
  }

  function exportar() {
    gerarPdfAnalitico(linhas, totais, [
      `OS: ${os.trim() ? `contém "${os.trim()}"` : "todas"}   |   Etapa: ${nomeEtapaFiltro}`,
      `Tipo: ${
        tipo === "OPERACAO" ? "Operação" : tipo === "PAUSA" ? "Pausa" : "Todos"
      }   |   Data: ${data ? formatarData(`${data}T12:00:00`) : "Todas"}`,
      `Registros: ${linhas.length}`,
    ]);
  }

  return (
    <>
      <div className="painel-topo">
        <h1 className="painel-titulo">Histórico</h1>
        <button type="button" className="botao" disabled={linhas.length === 0} onClick={exportar}>
          Exportar esta consulta
        </button>
      </div>

      <section className="cartao">
        <h2 className="cartao-titulo">Filtros</h2>
        <div className="filtros">
          <div>
            <label className="campo-rotulo" htmlFor="f-os">
              OS
            </label>
            <input
              id="f-os"
              className="campo"
              type="text"
              placeholder="Busca parcial"
              value={os}
              onChange={(e) => setOs(e.target.value)}
            />
          </div>

          <div>
            <label className="campo-rotulo" htmlFor="f-etapa">
              Etapa
            </label>
            <select
              id="f-etapa"
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

          <div>
            <label className="campo-rotulo" htmlFor="f-tipo">
              Tipo
            </label>
            <select
              id="f-tipo"
              className="campo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as "" | "OPERACAO" | "PAUSA")}
            >
              <option value="">Todos</option>
              <option value="OPERACAO">Operação</option>
              <option value="PAUSA">Pausa</option>
            </select>
          </div>

          <div>
            <label className="campo-rotulo" htmlFor="f-data">
              Data
            </label>
            <input
              id="f-data"
              className="campo"
              type="date"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>

          <div className="linha-acoes">
            <button type="button" className="botao botao--neutro" onClick={limparFiltros}>
              Limpar
            </button>
          </div>
        </div>
      </section>

      <CardsTotais totais={totais} />

      <section className="cartao">
        {erro && <p className="erro">{erro}</p>}

        <div className="tabela-rolagem">
          <table className="tabela">
            <thead>
              <tr>
                <th>#</th>
                <th>Número OS</th>
                <th>Etapa</th>
                <th>Tipo</th>
                <th>Data</th>
                <th>Hora Início</th>
                <th>Hora Fim</th>
                <th>Tempo Total</th>
                <th>Justificativa</th>
              </tr>
            </thead>
            <tbody>
              {linhasDaPagina.map((l, i) => (
                <tr key={l.id}>
                  <td className="col-num">{primeiroIndice + i + 1}</td>
                  <td>{l.numero_os}</td>
                  <td>{l.etapa_nome}</td>
                  <td>
                    <span
                      className={`etiqueta ${
                        l.tipo === "OPERACAO" ? "etiqueta--operacao" : "etiqueta--pausa"
                      }`}
                    >
                      {l.tipo === "OPERACAO" ? "Operação" : "Pausa"}
                    </span>
                  </td>
                  <td>{formatarData(l.inicio)}</td>
                  <td className="col-num">{formatarHora(l.inicio)}</td>
                  <td className="col-num">{formatarHora(l.fim)}</td>
                  <td className="col-num">{formatarDuracao(l.duracao_segundos)}</td>
                  <td className="col-justificativa">{l.justificativa ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {!carregando && linhas.length === 0 && !erro && (
          <p className="vazio">Nenhum apontamento para os filtros aplicados.</p>
        )}
        {carregando && <p className="vazio">Carregando…</p>}

        {linhas.length > 0 && (
          <div className="paginacao">
            <span className="paginacao-info">
              Mostrando {primeiroIndice + 1}–{primeiroIndice + linhasDaPagina.length} de{" "}
              {linhas.length} registros
            </span>
            <div className="paginacao-controles">
              <button
                type="button"
                className="botao botao--neutro botao--pequeno"
                disabled={paginaAtual === 1}
                onClick={() => setPagina(1)}
              >
                « Primeira
              </button>
              <button
                type="button"
                className="botao botao--neutro botao--pequeno"
                disabled={paginaAtual === 1}
                onClick={() => setPagina(paginaAtual - 1)}
              >
                ‹ Anterior
              </button>
              <span className="paginacao-pagina">
                Página {paginaAtual} de {totalPaginas}
              </span>
              <button
                type="button"
                className="botao botao--neutro botao--pequeno"
                disabled={paginaAtual === totalPaginas}
                onClick={() => setPagina(paginaAtual + 1)}
              >
                Próxima ›
              </button>
              <button
                type="button"
                className="botao botao--neutro botao--pequeno"
                disabled={paginaAtual === totalPaginas}
                onClick={() => setPagina(totalPaginas)}
              >
                Última »
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}

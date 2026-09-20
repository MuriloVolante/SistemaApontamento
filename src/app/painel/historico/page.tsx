"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listarEtapas } from "../../actions";
import { consultarApontamentos } from "../../consultas";
import CardsTotais from "../Totais";
import { gerarPdfAnalitico } from "@/lib/pdf";
import {
  dataLocalISO,
  formatarData,
  formatarDuracao,
  formatarHora,
  limitesLocais,
  segundosDoDia,
} from "@/lib/tempo";
import type { Etapa, FiltroConsulta, LinhaApontamento, Totais } from "@/lib/tipos";

const TOTAIS_ZERADOS: Totais = { total: 0, operacao: 0, pausa: 0 };
const POR_PAGINA = 50;

type Coluna =
  | "num"
  | "os"
  | "etapa"
  | "tipo"
  | "data"
  | "inicio"
  | "fim"
  | "duracao"
  | "justificativa";

type Direcao = "asc" | "desc";

/**
 * Cada coluna devolve o valor pelo qual ordena — sempre o que a célula mostra.
 * `num` é a ordem natural da consulta (cronológica), representada pelo índice.
 */
const COLUNAS: Array<{
  chave: Coluna;
  rotulo: string;
  numerica?: boolean;
  valor: (l: LinhaApontamento, indice: number) => string | number;
}> = [
  { chave: "num", rotulo: "#", numerica: true, valor: (_l, i) => i },
  { chave: "os", rotulo: "Número OS", valor: (l) => l.numero_os },
  { chave: "etapa", rotulo: "Etapa", valor: (l) => l.etapa_nome },
  { chave: "tipo", rotulo: "Tipo", valor: (l) => (l.tipo === "OPERACAO" ? "Operação" : "Pausa") },
  { chave: "data", rotulo: "Data", valor: (l) => dataLocalISO(l.inicio) },
  { chave: "inicio", rotulo: "Hora Início", numerica: true, valor: (l) => segundosDoDia(l.inicio) },
  { chave: "fim", rotulo: "Hora Fim", numerica: true, valor: (l) => segundosDoDia(l.fim) },
  { chave: "duracao", rotulo: "Tempo Total", numerica: true, valor: (l) => l.duracao_segundos },
  { chave: "justificativa", rotulo: "Justificativa", valor: (l) => l.justificativa ?? "" },
];

export default function Historico() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);

  const [os, setOs] = useState("");
  const [etapaId, setEtapaId] = useState("");
  const [tipo, setTipo] = useState<"" | "OPERACAO" | "PAUSA">("");
  const [data, setData] = useState("");

  const [linhas, setLinhas] = useState<LinhaApontamento[]>([]);
  const [totais, setTotais] = useState<Totais>(TOTAIS_ZERADOS);
  const [pagina, setPagina] = useState(1);
  const [coluna, setColuna] = useState<Coluna>("num");
  const [direcao, setDirecao] = useState<Direcao>("asc");
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

  // ---- ordenação ---------------------------------------------------------

  const linhasOrdenadas = useMemo(() => {
    const definicao = COLUNAS.find((c) => c.chave === coluna)!;
    const sinal = direcao === "asc" ? 1 : -1;

    // O índice original entra no par para servir de desempate estável e de
    // valor da própria coluna "#".
    return linhas
      .map((linha, indice) => ({ linha, indice }))
      .sort((a, b) => {
        const va = definicao.valor(a.linha, a.indice);
        const vb = definicao.valor(b.linha, b.indice);

        const comparacao = definicao.numerica
          ? (va as number) - (vb as number)
          : String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });

        // Empate mantém a ordem cronológica original.
        return comparacao !== 0 ? comparacao * sinal : a.indice - b.indice;
      })
      .map((par) => par.linha);
  }, [linhas, coluna, direcao]);

  function ordenarPor(nova: Coluna) {
    if (nova === coluna) {
      setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setColuna(nova);
      setDirecao("asc");
    }
    setPagina(1);
  }

  // ---- paginação (cards e PDF seguem sobre o filtro inteiro) -------------

  const totalPaginas = Math.max(1, Math.ceil(linhasOrdenadas.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const primeiroIndice = (paginaAtual - 1) * POR_PAGINA;
  const linhasDaPagina = linhasOrdenadas.slice(primeiroIndice, primeiroIndice + POR_PAGINA);

  const nomeEtapaFiltro = etapas.find((e) => e.id === etapaId)?.nome ?? "Todas";

  function limparFiltros() {
    setOs("");
    setEtapaId("");
    setTipo("");
    setData("");
  }

  function exportar() {
    // O PDF sai na mesma ordem que está na tela.
    gerarPdfAnalitico(linhasOrdenadas, totais, [
      `OS: ${os.trim() ? `contém "${os.trim()}"` : "todas"}   |   Etapa: ${nomeEtapaFiltro}`,
      `Tipo: ${
        tipo === "OPERACAO" ? "Operação" : tipo === "PAUSA" ? "Pausa" : "Todos"
      }   |   Data: ${data ? formatarData(`${data}T12:00:00`) : "Todas"}`,
      `Registros: ${linhasOrdenadas.length}`,
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
                {COLUNAS.map((c) => {
                  const ativa = c.chave === coluna;
                  return (
                    <th
                      key={c.chave}
                      aria-sort={
                        ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"
                      }
                    >
                      <button
                        type="button"
                        className={`ordenar ${ativa ? "ordenar--ativa" : ""}`}
                        onClick={() => ordenarPor(c.chave)}
                        title={`Ordenar por ${c.rotulo}`}
                      >
                        {c.rotulo}
                        <span className="ordenar-seta" aria-hidden="true">
                          {ativa ? (direcao === "asc" ? "↓" : "↑") : "↕"}
                        </span>
                      </button>
                    </th>
                  );
                })}
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
              {linhasOrdenadas.length} registros
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

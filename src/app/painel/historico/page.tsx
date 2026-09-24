"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { listarEtapas } from "../../actions";
import { consultarApontamentos } from "../../consultas";
import CardsTotais from "../Totais";
import type { Recorte } from "../Totais";
import CartoesOs from "./CartoesOs";
import ModalRelatorio from "./ModalRelatorio";
import Icone from "@/components/Icone";
import Modal from "@/components/Modal";
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

/** Abaixo disto a tabela deixa de caber e o histórico vira lista de cards. */
const LARGURA_CARTOES = "(max-width: 760px)";

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

/** Cada coluna ordena pelo valor que a célula mostra. */
const COLUNAS: Array<{
  chave: Coluna;
  rotulo: string;
  numerica?: boolean;
  valor: (l: LinhaApontamento) => string | number;
}> = [
  { chave: "num", rotulo: "#", numerica: true, valor: (l) => l.numero },
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
  const [data, setData] = useState("");
  // O tipo não tem campo próprio: quem controla são os cards de total.
  const [recorte, setRecorte] = useState<Recorte>(null);

  const [linhas, setLinhas] = useState<LinhaApontamento[]>([]);
  const [totais, setTotais] = useState<Totais>(TOTAIS_ZERADOS);
  const [pagina, setPagina] = useState(1);
  const [coluna, setColuna] = useState<Coluna>("num");
  const [direcao, setDirecao] = useState<Direcao>("asc");
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [relatorioAberto, setRelatorioAberto] = useState(false);

  // Escolha entre tabela e cards pela largura real, não por CSS: assim só
  // uma das duas árvores existe no DOM.
  const [emCartoes, setEmCartoes] = useState(false);
  useEffect(() => {
    const consulta = window.matchMedia(LARGURA_CARTOES);
    const aplicar = () => setEmCartoes(consulta.matches);
    aplicar();
    consulta.addEventListener("change", aplicar);
    return () => consulta.removeEventListener("change", aplicar);
  }, []);

  /**
   * A consulta ao banco ignora o recorte por tipo de propósito: os três cards
   * precisam continuar mostrando os totais da consulta inteira, senão o card
   * clicado zeraria os outros dois.
   */
  const filtro: FiltroConsulta = useMemo(() => {
    const { deISO, ateISO } = limitesLocais(data || undefined, data || undefined);
    return { os, etapaId, deISO, ateISO };
  }, [os, etapaId, data]);

  const carregarEtapas = useCallback(() => {
    listarEtapas(false)
      .then(setEtapas)
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregarEtapas();
  }, [carregarEtapas]);

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

  // ---- recorte por tipo + ordenação (só a tabela usa) ---------------------

  const linhasVisiveis = useMemo(() => {
    const recortadas = recorte ? linhas.filter((l) => l.tipo === recorte) : linhas;

    const definicao = COLUNAS.find((c) => c.chave === coluna)!;
    const sinal = direcao === "asc" ? 1 : -1;

    return [...recortadas].sort((a, b) => {
      const va = definicao.valor(a);
      const vb = definicao.valor(b);

      const comparacao = definicao.numerica
        ? (va as number) - (vb as number)
        : String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });

      // Empate mantém a ordem de criação.
      return comparacao !== 0 ? comparacao * sinal : a.numero - b.numero;
    });
  }, [linhas, recorte, coluna, direcao]);

  function ordenarPor(nova: Coluna) {
    if (nova === coluna) setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setColuna(nova);
      setDirecao("asc");
    }
    setPagina(1);
  }

  // ---- paginação ---------------------------------------------------------

  const totalPaginas = Math.max(1, Math.ceil(linhasVisiveis.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas);
  const primeiroIndice = (paginaAtual - 1) * POR_PAGINA;
  const linhasDaPagina = linhasVisiveis.slice(primeiroIndice, primeiroIndice + POR_PAGINA);

  const nomeEtapaFiltro = etapas.find((e) => e.id === etapaId)?.nome ?? "Todas";
  const filtrosAtivos =
    (os.trim() ? 1 : 0) + (etapaId ? 1 : 0) + (data ? 1 : 0) + (recorte ? 1 : 0);

  function limparFiltros() {
    setOs("");
    setEtapaId("");
    setData("");
    setRecorte(null);
  }

  /** Rótulo curto do filtro de data, para o chip. */
  function rotuloData() {
    if (!data) return "Todas as datas";
    if (data === dataLocalISO(new Date().toISOString())) return "Hoje";
    const [, mes, dia] = data.split("-");
    return `${dia}/${mes}`;
  }

  const campos = (
    <div className="filtros-campos">
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
    </div>
  );

  return (
    <>
      <div className="painel-topo">
        <h1 className="painel-titulo">Histórico</h1>
        <button
          type="button"
          className="botao botao--neutro filtros-alternar"
          aria-expanded={filtrosAbertos}
          onClick={() => setFiltrosAbertos((a) => !a)}
        >
          <Icone nome="filtro" tamanho={16} />
          Filtros
          {filtrosAtivos > 0 && <span className="filtros-contador">{filtrosAtivos}</span>}
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}

      {emCartoes ? (
        /* ---- celular: chips, KPIs e um card por OS ---- */
        <>
          <div className="chips">
            <button type="button" className="chip" onClick={() => setFiltrosAbertos(true)}>
              {rotuloData()} <span aria-hidden="true">▾</span>
            </button>
            <button
              type="button"
              className={`chip ${etapaId ? "chip--ativo" : ""}`}
              onClick={() => setFiltrosAbertos(true)}
            >
              {etapaId ? nomeEtapaFiltro : "Etapa"} <span aria-hidden="true">▾</span>
            </button>
            <button
              type="button"
              className={`chip ${os.trim() ? "chip--ativo" : ""}`}
              onClick={() => setFiltrosAbertos(true)}
            >
              <Icone nome="lupa" tamanho={13} />
              {os.trim() || "OS"}
            </button>
            {filtrosAtivos > 0 && (
              <button type="button" className="chip chip--limpar" onClick={limparFiltros}>
                <Icone nome="fechar" tamanho={12} />
                Limpar
              </button>
            )}
          </div>

          <CartoesOs linhas={linhas} totais={totais} carregando={carregando} />

          <button
            type="button"
            className="fab"
            onClick={() => setRelatorioAberto(true)}
            title="Gerar relatório"
            aria-label="Gerar relatório"
          >
            <Icone nome="relatorio" tamanho={20} />
          </button>

          {filtrosAbertos && (
            <Modal titulo="Filtros" variante="inferior" aoFechar={() => setFiltrosAbertos(false)}>
              {campos}
              <div className="modal-rodape modal-rodape--duplo">
                <button
                  type="button"
                  className="botao botao--neutro"
                  onClick={limparFiltros}
                  disabled={filtrosAtivos === 0}
                >
                  Limpar
                </button>
                <button type="button" className="botao" onClick={() => setFiltrosAbertos(false)}>
                  Ver resultados
                </button>
              </div>
            </Modal>
          )}
        </>
      ) : (
        /* ---- tela larga: filtros na lateral e a tabela completa ---- */
        <div className="historico">
          <aside className={`filtros-lateral ${filtrosAbertos ? "filtros-lateral--aberta" : ""}`}>
            <div className="cartao filtros-caixa">
              <h2 className="cartao-titulo">Filtros</h2>
              {campos}

              <p className="filtros-dica">O tipo é escolhido clicando nos cards de tempo.</p>

              <div className="filtros-acoes">
                <button
                  type="button"
                  className="botao botao--neutro"
                  onClick={limparFiltros}
                  disabled={filtrosAtivos === 0}
                >
                  Limpar
                </button>
                <button type="button" className="botao" onClick={() => setRelatorioAberto(true)}>
                  <Icone nome="relatorio" tamanho={16} />
                  Gerar relatório
                </button>
              </div>
            </div>
          </aside>

          <div className="historico-conteudo">
            <CardsTotais
              totais={totais}
              recorte={recorte}
              aoRecortar={(novo) => {
                setRecorte(novo);
                setPagina(1);
              }}
            />

            <section className="cartao">
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
                    {linhasDaPagina.map((l) => (
                      <tr key={l.id}>
                        {/* O "#" é o sequencial do registro, não a posição na
                            tela: ele segue a linha por qualquer filtro. */}
                        <td className="col-num">{l.numero}</td>
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

              {!carregando && linhasVisiveis.length === 0 && !erro && (
                <p className="vazio">Nenhum apontamento para os filtros aplicados.</p>
              )}
              {carregando && <p className="vazio">Carregando…</p>}

              {linhasVisiveis.length > 0 && (
                <div className="paginacao">
                  <span className="paginacao-info">
                    Mostrando {primeiroIndice + 1}–{primeiroIndice + linhasDaPagina.length} de{" "}
                    {linhasVisiveis.length} registros
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
          </div>
        </div>
      )}

      {relatorioAberto && (
        <ModalRelatorio
          herdado={{ os, etapaId, nomeEtapa: nomeEtapaFiltro, tipo: recorte ?? "" }}
          aoFechar={() => setRelatorioAberto(false)}
        />
      )}
    </>
  );
}

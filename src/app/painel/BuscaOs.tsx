"use client";

import { useEffect, useRef, useState } from "react";
import Icone from "@/components/Icone";
import CardsTotais from "./Totais";
import { buscarOs } from "../consultas";
import { diferencaEmSegundos, formatarData, formatarDuracao, formatarHora } from "@/lib/tempo";
import type { ResultadoBuscaOs, SessaoAtiva } from "@/lib/tipos";

interface Props {
  /** Sessões vindas do fluxo ao vivo: o cartão de situação acompanha sozinho. */
  sessoesAoVivo: SessaoAtiva[];
  /** Relógio corrigido pelo desvio do servidor. */
  agoraCorrigido: () => Date;
  /** Muda quando um apontamento é gravado: hora de reconsultar o histórico. */
  revisao: number | null;
  /** Avisa o dashboard para recolher o conteúdo normal durante a busca. */
  aoMudarBusca: (ativa: boolean) => void;
  /**
   * Modo do vendedor: onde a OS está e por onde passou, sem nada de tempo.
   * Sem os totais, sem a coluna de duração e sem o cronômetro do cartão, porque o
   * acesso dele é para consultar a OS, não para medir produção.
   */
  consultaApenas?: boolean;
}

export default function BuscaOs({
  sessoesAoVivo,
  agoraCorrigido,
  revisao,
  aoMudarBusca,
  consultaApenas = false,
}: Props) {
  const [texto, setTexto] = useState("");
  const [buscada, setBuscada] = useState("");
  const [resultado, setResultado] = useState<ResultadoBuscaOs | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function executarBusca(os: string) {
    const limpo = os.trim();
    if (!limpo) return;

    setBuscando(true);
    setErro(null);
    try {
      const r = await buscarOs(limpo);
      setResultado(r);
      setBuscada(limpo);
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setBuscando(false);
    }
  }

  // Um apontamento novo pode ser justamente desta OS: refaz a consulta. Só a
  // revisão dispara; a OS buscada é lida da ref, com o valor de agora.
  const buscadaRef = useRef(buscada);
  buscadaRef.current = buscada;
  useEffect(() => {
    const os = buscadaRef.current;
    if (!os) return;
    buscarOs(os)
      .then(setResultado)
      .catch(() => {
        /* a próxima revisão tenta de novo */
      });
  }, [revisao]);

  useEffect(() => {
    aoMudarBusca(resultado !== null);
  }, [resultado, aoMudarBusca]);

  function limpar() {
    setTexto("");
    setBuscada("");
    setResultado(null);
    setErro(null);
  }

  // Etapa e Tipo (e a justificativa, na visão do gestor) ficam com a sobra
  // da largura; número, datas, horas e duração encolhem até o tamanho do
  // conteúdo e ficam juntos à direita. Repartidas por igual, a hora de
  // início ficava longe da própria data e colada na data de fim.
  const colunas = [
    { rotulo: "#", numerica: true, compacta: true },
    { rotulo: "Etapa" },
    { rotulo: "Tipo" },
    { rotulo: "Data Início", compacta: true },
    { rotulo: "Hora Início", numerica: true, compacta: true },
    { rotulo: "Data Fim", compacta: true },
    { rotulo: "Hora Fim", numerica: true, compacta: true },
    ...(consultaApenas
      ? []
      : [{ rotulo: "Tempo Total", numerica: true, compacta: true }, { rotulo: "Justificativa" }]),
  ];

  // A situação vem do fluxo ao vivo, então o cronômetro corre sem reconsultar.
  // Todas as máquinas onde a OS está agora: a mesma OS pode rodar em duas
  // etapas ao mesmo tempo, e mostrar só a primeira escondia a outra.
  const emCurso = buscada ? sessoesAoVivo.filter((s) => s.numero_os === buscada) : [];

  return (
    <>
      <form
        className="busca"
        role="search"
        onSubmit={(e) => {
          e.preventDefault();
          executarBusca(texto);
        }}
      >
        <span className="busca-lupa">
          <Icone nome="lupa" tamanho={18} />
        </span>
        <input
          className="busca-campo"
          type="search"
          placeholder="Buscar OS"
          aria-label="Buscar OS"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
        />
        {buscada && (
          <button type="button" className="busca-limpar" onClick={limpar} title="Limpar busca">
            <Icone nome="fechar" tamanho={16} />
          </button>
        )}
        <button type="submit" className="botao" disabled={!texto.trim() || buscando}>
          {buscando ? "Buscando…" : "Buscar"}
        </button>
      </form>

      {erro && <p className="erro">{erro}</p>}

      {resultado && (
        <section className="busca-resultado">
          {/* Onde a OS está agora: um cartão por máquina em que ela roda. */}
          {emCurso.length === 0 ? (
            <article className="situacao-os situacao-os--parado">
              <div className="situacao-os-icone">
                <Icone nome="caixa" tamanho={26} />
              </div>
              <div className="situacao-os-texto">
                <span className="situacao-os-rotulo">{resultado.os}</span>
                <strong className="situacao-os-etapa">Não está em operação</strong>
                <span className="situacao-os-detalhe">
                  {resultado.linhas.length > 0
                    ? `Última etapa: ${resultado.linhas[resultado.linhas.length - 1].etapa_nome}`
                    : "Nenhum apontamento registrado para esta OS"}
                </span>
              </div>
            </article>
          ) : (
            emCurso.map((sessao) => (
              <article
                key={sessao.etapa_id}
                className={`situacao-os ${
                  sessao.status === "PAUSADO" ? "situacao-os--pausado" : "situacao-os--andamento"
                }`}
              >
                <div className="situacao-os-icone">
                  <Icone nome="caixa" tamanho={26} />
                </div>

                <div className="situacao-os-texto">
                  <span className="situacao-os-rotulo">{resultado.os}</span>
                  <strong className="situacao-os-etapa">{sessao.etapa_nome}</strong>
                  <span className="situacao-os-detalhe">
                    {sessao.status === "PAUSADO"
                      ? `Pausado${sessao.motivo ? ` · ${sessao.motivo}` : ""}`
                      : "Em andamento"}{" "}
                    · desde {formatarHora(sessao.segmento_inicio)}
                  </span>
                </div>

                {!consultaApenas && (
                  <div className="situacao-os-cronometro">
                    {formatarDuracao(diferencaEmSegundos(sessao.segmento_inicio, agoraCorrigido()))}
                  </div>
                )}
              </article>
            ))
          )}

          {!consultaApenas && <CardsTotais totais={resultado.totais} />}

          <div className="cartao">
            <h2 className="cartao-titulo">Histórico da OS · {resultado.linhas.length} registros</h2>

            {resultado.linhas.length === 0 ? (
              <p className="vazio">Nenhum apontamento registrado para esta OS.</p>
            ) : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      {colunas.map((c) => (
                        <th key={c.rotulo} className={c.compacta ? "col-compacta" : undefined}>
                          {/* Cabeçalho de coluna numérica encosta à direita,
                              junto com o número: alinhamentos opostos na mesma
                              coluna é o que fazia a tabela parecer torta. */}
                          <span
                            className={`cabecalho-simples ${
                              c.numerica ? "cabecalho-simples--num" : ""
                            }`}
                          >
                            {c.rotulo}
                          </span>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.linhas.map((l) => (
                      <tr key={l.id}>
                        <td className="col-num col-compacta">{l.numero}</td>
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
                        <td className="col-compacta">{formatarData(l.inicio)}</td>
                        <td className="col-num col-compacta">{formatarHora(l.inicio)}</td>
                        <td className="col-compacta">{formatarData(l.fim)}</td>
                        <td className="col-num col-compacta">{formatarHora(l.fim)}</td>
                        {!consultaApenas && (
                          <>
                            <td className="col-num col-compacta">{formatarDuracao(l.duracao_segundos)}</td>
                            <td className="col-justificativa">{l.justificativa ?? ""}</td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      )}
    </>
  );
}

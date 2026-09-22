"use client";

import { useEffect, useState } from "react";
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
}

export default function BuscaOs({ sessoesAoVivo, agoraCorrigido, revisao, aoMudarBusca }: Props) {
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

  // Um apontamento novo pode ser justamente desta OS: refaz a consulta.
  useEffect(() => {
    if (!buscada) return;
    buscarOs(buscada)
      .then(setResultado)
      .catch(() => {
        /* a próxima revisão tenta de novo */
      });
    // `buscada` é reconsultada apenas quando a revisão muda.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

  // A situação vem do fluxo ao vivo, então o cronômetro corre sem reconsultar.
  const emCurso = buscada ? sessoesAoVivo.find((s) => s.numero_os === buscada) ?? null : null;

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
          {/* Onde a OS está agora */}
          <article
            className={`situacao-os ${
              emCurso
                ? emCurso.status === "PAUSADO"
                  ? "situacao-os--pausado"
                  : "situacao-os--andamento"
                : "situacao-os--parado"
            }`}
          >
            <div className="situacao-os-icone">
              <Icone nome="caixa" tamanho={26} />
            </div>

            <div className="situacao-os-texto">
              <span className="situacao-os-rotulo">{resultado.os}</span>
              {emCurso ? (
                <>
                  <strong className="situacao-os-etapa">{emCurso.etapa_nome}</strong>
                  <span className="situacao-os-detalhe">
                    {emCurso.status === "PAUSADO"
                      ? `Pausado${emCurso.motivo ? ` · ${emCurso.motivo}` : ""}`
                      : "Em andamento"}{" "}
                    · desde {formatarHora(emCurso.segmento_inicio)}
                  </span>
                </>
              ) : (
                <>
                  <strong className="situacao-os-etapa">Não está em operação</strong>
                  <span className="situacao-os-detalhe">
                    {resultado.linhas.length > 0
                      ? `Última etapa: ${resultado.linhas[resultado.linhas.length - 1].etapa_nome}`
                      : "Nenhum apontamento registrado para esta OS"}
                  </span>
                </>
              )}
            </div>

            {emCurso && (
              <div className="situacao-os-cronometro">
                {formatarDuracao(diferencaEmSegundos(emCurso.segmento_inicio, agoraCorrigido()))}
              </div>
            )}
          </article>

          <CardsTotais totais={resultado.totais} />

          <div className="cartao">
            <h2 className="cartao-titulo">Histórico da OS · {resultado.linhas.length} registros</h2>

            {resultado.linhas.length === 0 ? (
              <p className="vazio">Nenhum apontamento registrado para esta OS.</p>
            ) : (
              <div className="tabela-rolagem">
                <table className="tabela">
                  <thead>
                    <tr>
                      <th>
                        <span className="cabecalho-simples">#</span>
                      </th>
                      <th>
                        <span className="cabecalho-simples">Etapa</span>
                      </th>
                      <th>
                        <span className="cabecalho-simples">Tipo</span>
                      </th>
                      <th>
                        <span className="cabecalho-simples">Data</span>
                      </th>
                      <th>
                        <span className="cabecalho-simples">Hora Início</span>
                      </th>
                      <th>
                        <span className="cabecalho-simples">Hora Fim</span>
                      </th>
                      <th>
                        <span className="cabecalho-simples">Tempo Total</span>
                      </th>
                      <th>
                        <span className="cabecalho-simples">Justificativa</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {resultado.linhas.map((l) => (
                      <tr key={l.id}>
                        <td className="col-num">{l.numero}</td>
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
            )}
          </div>
        </section>
      )}
    </>
  );
}

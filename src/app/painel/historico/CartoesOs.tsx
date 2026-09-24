"use client";

import { useMemo, useState } from "react";
import Icone from "@/components/Icone";
import { agruparPorOsEtapa, ordenarGrupos } from "@/lib/agrupar";
import type { CriterioGrupo, GrupoOs } from "@/lib/agrupar";
import CardsTotais from "../Totais";
import { formatarDuracaoCurta, formatarHora } from "@/lib/tempo";
import type { LinhaApontamento, Totais } from "@/lib/tipos";

interface Props {
  linhas: LinhaApontamento[];
  totais: Totais;
  carregando: boolean;
}

const CRITERIOS: Array<{ chave: CriterioGrupo; rotulo: string }> = [
  { chave: "tempo", rotulo: "Maior tempo" },
  { chave: "pausa", rotulo: "Maior % parado" },
];

/**
 * Histórico no celular: um card por OS/etapa/dia, não por evento.
 *
 * A tabela completa é um log — responde "o que aconteceu às 14h32", que é
 * pergunta de auditoria. Aqui a leitura é de decisão: quanto a OS consumiu
 * naquela etapa, que fatia disso foi parada e por quê. Os horários evento a
 * evento continuam disponíveis, um toque abaixo.
 */
export default function CartoesOs({ linhas, totais, carregando }: Props) {
  const [criterio, setCriterio] = useState<CriterioGrupo>("tempo");
  const [aberto, setAberto] = useState<string | null>(null);

  const grupos = useMemo(
    () => ordenarGrupos(agruparPorOsEtapa(linhas), criterio),
    [linhas, criterio]
  );

  return (
    <>
      {/* Os mesmos cards do dashboard: ícone, faixa de cor e rótulo por
          extenso. A fatia de ociosidade entra sob o card de pausa. */}
      <CardsTotais totais={totais} mostrarPercentualPausa />

      {grupos.length > 1 && (
        <div className="ordenar-grupos" role="group" aria-label="Ordenar por">
          {CRITERIOS.map((c) => (
            <button
              key={c.chave}
              type="button"
              className={`ordenar-grupo ${criterio === c.chave ? "ordenar-grupo--ativo" : ""}`}
              aria-pressed={criterio === c.chave}
              onClick={() => setCriterio(c.chave)}
            >
              {c.rotulo}
            </button>
          ))}
        </div>
      )}

      {carregando && <p className="vazio">Carregando…</p>}

      {!carregando && grupos.length === 0 && (
        <p className="vazio">Nenhum apontamento para os filtros aplicados.</p>
      )}

      <ul className="lista-grupos">
        {grupos.map((g) => (
          <CartaoGrupo
            key={g.chave}
            grupo={g}
            expandido={aberto === g.chave}
            aoAlternar={() => setAberto((a) => (a === g.chave ? null : g.chave))}
          />
        ))}
      </ul>
    </>
  );
}

function CartaoGrupo({
  grupo,
  expandido,
  aoAlternar,
}: {
  grupo: GrupoOs;
  expandido: boolean;
  aoAlternar: () => void;
}) {
  const [ano, mes, dia] = grupo.dia.split("-");
  const percentualOp = Math.round(grupo.percentualOperacao);

  return (
    <li className="grupo">
      <button
        type="button"
        className="grupo-topo"
        aria-expanded={expandido}
        onClick={aoAlternar}
      >
        <span className="grupo-identificacao">
          <strong className="grupo-os">{grupo.numero_os}</strong>
          <span className="grupo-meta">
            {grupo.etapa_nome} · {dia}/{mes}
            <span className="grupo-ano">/{ano}</span>
          </span>
        </span>

        <span className="grupo-tempo">{formatarDuracaoCurta(grupo.total)}</span>

        <span className={`grupo-seta ${expandido ? "grupo-seta--aberta" : ""}`} aria-hidden="true">
          ▸
        </span>
      </button>

      {/* A barra substitui as colunas Tipo, Início, Fim e Tempo: a proporção
          entre operação e parada é lida de relance. */}
      <div className="grupo-barra" role="img" aria-label={`${percentualOp}% em operação`}>
        <span className="grupo-barra-op" style={{ width: `${grupo.percentualOperacao}%` }} />
      </div>

      <p className="grupo-legenda">
        <span className="grupo-percentual">{percentualOp}% em operação</span>
        {grupo.motivos.length > 0 && (
          <span className="grupo-motivos">
            {grupo.motivos.map((m) => (
              <span key={m.texto} className="grupo-motivo">
                {m.texto} ({m.vezes > 1 ? `${m.vezes}× · ` : ""}
                {formatarDuracaoCurta(m.segundos)})
              </span>
            ))}
          </span>
        )}
      </p>

      {expandido && (
        <ol className="linha-do-tempo">
          {grupo.eventos.map((e) => (
            <li
              key={e.id}
              className={`evento ${e.tipo === "PAUSA" ? "evento--pausa" : "evento--operacao"}`}
            >
              <span className="evento-icone">
                <Icone nome={e.tipo === "PAUSA" ? "pausa" : "operacao"} tamanho={11} />
              </span>
              <span className="evento-horas">
                {formatarHora(e.inicio)} – {formatarHora(e.fim)}
              </span>
              <span className="evento-duracao">{formatarDuracaoCurta(e.duracao_segundos)}</span>
              {e.tipo === "PAUSA" && e.justificativa && (
                <span className="evento-motivo">{e.justificativa}</span>
              )}
            </li>
          ))}
        </ol>
      )}
    </li>
  );
}

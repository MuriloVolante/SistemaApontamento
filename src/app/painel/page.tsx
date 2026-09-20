"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listarSessoesAtivas } from "../actions";
import { consultarApontamentos } from "../consultas";
import CardsTotais from "./Totais";
import {
  dataLocalISO,
  diferencaEmSegundos,
  formatarData,
  formatarDuracao,
  formatarHora,
  limitesLocais,
} from "@/lib/tempo";
import type { SessaoAtiva, Totais } from "@/lib/tipos";

const TOTAIS_ZERADOS: Totais = { total: 0, operacao: 0, pausa: 0 };

/** De quanto em quanto tempo o dashboard reconsulta o banco. */
const INTERVALO_ATUALIZACAO = 15_000;

export default function Dashboard() {
  const [sessoes, setSessoes] = useState<SessaoAtiva[]>([]);
  const [totais, setTotais] = useState<Totais>(TOTAIS_ZERADOS);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  // Desvio entre o relógio do servidor e o do navegador: cada cronômetro é
  // recalculado por diferença de timestamps, nunca por contador incremental.
  const desvioRelogio = useRef(0);
  const [, forcarRedesenho] = useState(0);

  const hoje = dataLocalISO(new Date().toISOString());

  const atualizar = useCallback(async () => {
    const { deISO, ateISO } = limitesLocais(hoje, hoje);
    const [ativo, doDia] = await Promise.all([
      listarSessoesAtivas(),
      consultarApontamentos({ deISO, ateISO }),
    ]);

    desvioRelogio.current = new Date(ativo.agora).getTime() - Date.now();
    setSessoes(ativo.sessoes);
    setTotais(doDia.totais);
  }, [hoje]);

  useEffect(() => {
    let vivo = true;

    const rodar = () =>
      atualizar()
        .then(() => {
          if (vivo) setErro(null);
        })
        .catch((e: Error) => {
          if (vivo) setErro(e.message);
        })
        .finally(() => {
          if (vivo) setCarregando(false);
        });

    rodar();
    const relogio = window.setInterval(rodar, INTERVALO_ATUALIZACAO);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") rodar();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      vivo = false;
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [atualizar]);

  // Pulso dos cronômetros: só redesenha, o valor vem da diferença de datas.
  useEffect(() => {
    const pulso = window.setInterval(() => forcarRedesenho((n) => n + 1), 500);
    return () => window.clearInterval(pulso);
  }, []);

  const agoraCorrigido = () => new Date(Date.now() + desvioRelogio.current);

  return (
    <>
      <div className="painel-topo">
        <h1 className="painel-titulo">Dashboard</h1>
        <span className="painel-legenda">Totais de hoje · {formatarData(`${hoje}T12:00:00`)}</span>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <CardsTotais totais={totais} />

      <section className="cartao">
        <div className="cartao-cabecalho">
          <h2 className="cartao-titulo">
            OS em andamento{sessoes.length > 0 ? ` · ${sessoes.length}` : ""}
          </h2>
        </div>

        {carregando && <p className="vazio">Carregando…</p>}

        {!carregando && sessoes.length === 0 && (
          <p className="vazio">Nenhuma OS em andamento no momento.</p>
        )}

        <div className="os-grade">
          {sessoes.map((s) => {
            const pausada = s.status === "PAUSADO";
            const decorrido = diferencaEmSegundos(s.segmento_inicio, agoraCorrigido());

            return (
              <article
                key={s.etapa_id}
                className={`os-cartao ${pausada ? "os-cartao--pausado" : "os-cartao--andamento"}`}
              >
                <header className="os-cartao-topo">
                  <span className="os-numero">{s.numero_os}</span>
                  <span className={`etiqueta ${pausada ? "etiqueta--pausa" : "etiqueta--operacao"}`}>
                    {pausada ? "Pausado" : "Em andamento"}
                  </span>
                </header>

                <p className="os-etapa">{s.etapa_nome}</p>
                <p className="os-cronometro">{formatarDuracao(decorrido)}</p>

                <p className="os-rodape">
                  {pausada && s.motivo ? s.motivo : `Desde ${formatarHora(s.segmento_inicio)}`}
                </p>
              </article>
            );
          })}
        </div>
      </section>
    </>
  );
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listarSessoesAtivas } from "../actions";
import { consultarApontamentos } from "../consultas";
import CardsTotais from "./Totais";
import BuscaOs from "./BuscaOs";
import Icone from "@/components/Icone";
import {
  dataLocalISO,
  diferencaEmSegundos,
  formatarDuracao,
  formatarHora,
  limitesLocais,
} from "@/lib/tempo";
import type { AtualizacaoAoVivo, SessaoAtiva, Totais } from "@/lib/tipos";

const TOTAIS_ZERADOS: Totais = { total: 0, operacao: 0, pausa: 0 };

/** Só entra em ação se o fluxo de eventos não estiver disponível. */
const INTERVALO_RESERVA = 15_000;

export default function Dashboard() {
  const [sessoes, setSessoes] = useState<SessaoAtiva[]>([]);
  const [totais, setTotais] = useState<Totais>(TOTAIS_ZERADOS);
  const [carregando, setCarregando] = useState(true);
  const [aoVivo, setAoVivo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Desvio entre o relógio do servidor e o do navegador: cada cronômetro é
  // recalculado por diferença de timestamps, nunca por contador incremental.
  const desvioRelogio = useRef(0);
  const [, forcarRedesenho] = useState(0);

  // Última revisão de apontamentos já refletida nos cards.
  const revisaoCarregada = useRef<number | null>(null);
  const [revisao, setRevisao] = useState<number | null>(null);
  const [buscaAtiva, setBuscaAtiva] = useState(false);

  const hoje = dataLocalISO(new Date().toISOString());

  /**
   * Recalcula os totais do dia. O recorte usa o fuso do navegador, por isso
   * fica aqui e não no servidor.
   */
  const carregarTotais = useCallback(async () => {
    const { deISO, ateISO } = limitesLocais(hoje, hoje);
    const { totais: t } = await consultarApontamentos({ deISO, ateISO });
    setTotais(t);
  }, [hoje]);

  const aplicar = useCallback(
    (dados: AtualizacaoAoVivo) => {
      desvioRelogio.current = new Date(dados.agora).getTime() - Date.now();
      setSessoes(dados.sessoes);
      setCarregando(false);

      // Os cards só são reconsultados quando algum apontamento foi gravado.
      if (revisaoCarregada.current !== dados.revisaoApontamentos) {
        revisaoCarregada.current = dados.revisaoApontamentos;
        setRevisao(dados.revisaoApontamentos);
        carregarTotais().catch((e: Error) => setErro(e.message));
      }
    },
    [carregarTotais]
  );

  // ---- fluxo de eventos do servidor --------------------------------------

  useEffect(() => {
    let vivo = true;
    let reserva: number | null = null;

    // Plano B: se o fluxo não abrir (proxy, rede), volta a consultar de tempos
    // em tempos para a tela nunca ficar parada.
    const ligarReserva = () => {
      if (reserva !== null) return;
      const consultar = () =>
        listarSessoesAtivas()
          .then((r) => {
            if (!vivo) return;
            aplicar({ ...r, revisaoApontamentos: Date.now() });
          })
          .catch((e: Error) => vivo && setErro(e.message));
      consultar();
      reserva = window.setInterval(consultar, INTERVALO_RESERVA);
    };

    const desligarReserva = () => {
      if (reserva === null) return;
      window.clearInterval(reserva);
      reserva = null;
    };

    const fonte = new EventSource("/api/ativos");

    fonte.onopen = () => {
      if (!vivo) return;
      setAoVivo(true);
      setErro(null);
      desligarReserva();
    };

    fonte.onmessage = (evento) => {
      if (!vivo) return;
      try {
        aplicar(JSON.parse(evento.data) as AtualizacaoAoVivo);
        setErro(null);
      } catch {
        /* pacote malformado: o próximo corrige */
      }
    };

    fonte.onerror = () => {
      if (!vivo) return;
      // O EventSource tenta reconectar sozinho; até lá, a reserva assume.
      setAoVivo(false);
      ligarReserva();
    };

    return () => {
      vivo = false;
      desligarReserva();
      fonte.close();
    };
  }, [aplicar]);

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
        {/* Estado da conexão só aparece quando há o que avisar. */}
        {!aoVivo && <span className="reconectando">Reconectando…</span>}
      </div>

      <BuscaOs
        sessoesAoVivo={sessoes}
        agoraCorrigido={agoraCorrigido}
        revisao={revisao}
        aoMudarBusca={setBuscaAtiva}
      />

      {erro && <p className="erro">{erro}</p>}

      {/* Durante a busca o painel do dia sai de cena para não competir. */}
      {!buscaAtiva && (
        <>
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
                  <span
                    className={`etiqueta etiqueta--com-icone ${
                      pausada ? "etiqueta--pausa" : "etiqueta--operacao"
                    }`}
                  >
                    <Icone nome={pausada ? "pausa" : "operacao"} tamanho={11} />
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
      )}
    </>
  );
}

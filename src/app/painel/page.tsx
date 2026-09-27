"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { listarSessoesAtivas } from "../actions";
import { totaisDoPeriodo } from "../consultas";
import CardsTotais from "./Totais";
import { useUsuario } from "./ContextoUsuario";
import BuscaOs from "./BuscaOs";
import Icone from "@/components/Icone";
import { diferencaEmSegundos, formatarDuracao, formatarHora } from "@/lib/tempo";
import type { AtualizacaoAoVivo, SessaoAtiva, Totais } from "@/lib/tipos";

const TOTAIS_ZERADOS: Totais = { total: 0, operacao: 0, pausa: 0 };

/** Só entra em ação se o fluxo de eventos não estiver disponível. */
const INTERVALO_RESERVA = 15_000;

/**
 * Quedas do fluxo, e em que janela de tempo, para desistir dele de vez.
 *
 * Em hospedagem sem processo fixo (Vercel e afins) a conexão é cortada ao
 * atingir o tempo máximo da função, o EventSource reconecta, é cortado de
 * novo, e cada volta levanta uma instância nova lendo o banco. Quatro quedas
 * em dois minutos é o sinal de que aquele servidor não segura um fluxo aberto:
 * melhor assumir a consulta periódica e parar de insistir. Numa queda
 * esporádica de rede a contagem expira sozinha e o fluxo continua valendo.
 */
const QUEDAS_ATE_DESISTIR = 4;
const JANELA_DE_QUEDAS = 120_000;

/**
 * Na consulta periódica, de quanto em quanto tempo tentar o fluxo de novo.
 * Um servidor reiniciado também derruba o fluxo quatro vezes seguidas, e sem
 * nova tentativa todo painel aberto ficaria na consulta de 15 s até alguém
 * recarregar a página.
 */
const NOVA_TENTATIVA_FLUXO = 120_000;

/**
 * Como a tela está recebendo as mudanças.
 * - conectando: abrindo o fluxo pela primeira vez; não há o que avisar.
 * - vivo: fluxo aberto, cada mudança chega na hora.
 * - reconectando: o fluxo caiu e o navegador está tentando de novo.
 * - reserva: o fluxo foi abandonado e a tela consulta a cada 15 s. Continua
 *   atualizada, só não instantânea: o aviso é informativo, não um alarme.
 */
type Modo = "conectando" | "vivo" | "reconectando" | "reserva";

/** Totais fechados e as sessões que valiam quando eles foram lidos. */
interface Base {
  totais: Totais;
  sessoes: SessaoAtiva[];
}

/**
 * Soma aos totais fechados o segmento que está em aberto agora.
 *
 * Sem isso, uma máquina rodando desde as 7h sem pausar aparecia com zero até
 * a primeira parada. Os totais cobrem todas as datas, então todo segmento em
 * aberto entra, seja de quando for.
 */
function somarEmAberto(base: Base, agora: Date): Totais {
  const t = { ...base.totais };
  for (const s of base.sessoes) {
    const segundos = diferencaEmSegundos(s.segmento_inicio, agora);
    t.total += segundos;
    if (s.status === "EM_ANDAMENTO") t.operacao += segundos;
    else t.pausa += segundos;
  }
  return t;
}

export default function Dashboard() {
  // O vendedor entra aqui para uma coisa só: saber onde está a OS do cliente.
  // Nada de totais nem de cronômetros, só a busca e o que ela responde.
  const consultaApenas = useUsuario().tipo === "VENDEDOR";

  const [sessoes, setSessoes] = useState<SessaoAtiva[]>([]);
  const [base, setBase] = useState<Base>({ totais: TOTAIS_ZERADOS, sessoes: [] });
  const [carregando, setCarregando] = useState(true);
  const [modo, setModo] = useState<Modo>("conectando");
  const [erro, setErro] = useState<string | null>(null);

  // Desvio entre o relógio do servidor e o do navegador: cada cronômetro é
  // recalculado por diferença de timestamps, nunca por contador incremental.
  const desvioRelogio = useRef(0);
  const [, forcarRedesenho] = useState(0);

  // Última revisão de apontamentos já refletida nos cards.
  const revisaoCarregada = useRef<number | null>(null);
  const [revisao, setRevisao] = useState<number | null>(null);
  const [buscaAtiva, setBuscaAtiva] = useState(false);

  /**
   * Recalcula os totais de todas as datas e os guarda junto com as sessões
   * que valiam naquele momento.
   *
   * Trocar os dois juntos é o que impede o total de "descer" por um instante:
   * quando uma pausa é gravada, as sessões novas chegam antes dos totais
   * novos, e somar o segmento recém-reiniciado aos totais velhos faria o
   * tempo que acabou de fechar sumir das duas partes até a consulta voltar.
   */
  const carregarTotais = useCallback(
    async (sessoesDoMomento: SessaoAtiva[]) => {
      if (consultaApenas) return;
      const totais = await totaisDoPeriodo();
      setBase({ totais, sessoes: sessoesDoMomento });
    },
    [consultaApenas]
  );

  const aplicar = useCallback(
    (dados: AtualizacaoAoVivo) => {
      desvioRelogio.current = new Date(dados.agora).getTime() - Date.now();
      setSessoes(dados.sessoes);
      setCarregando(false);

      if (revisaoCarregada.current !== dados.revisaoApontamentos) {
        // Gravou apontamento: reconsulta e só então troca totais e sessões.
        revisaoCarregada.current = dados.revisaoApontamentos;
        setRevisao(dados.revisaoApontamentos);
        carregarTotais(dados.sessoes).catch(() =>
          setErro("Não foi possível atualizar os totais agora. Tentando de novo.")
        );
      } else {
        // Sem registro novo (uma OS acabou de começar): nada fechou, então as
        // sessões novas podem entrar direto na soma.
        setBase((b) => ({ ...b, sessoes: dados.sessoes }));
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
            // A consulta periódica não traz revisão: força a releitura dos totais.
            aplicar({ ...r, revisaoApontamentos: Date.now() });
            setErro(null);
          })
          .catch(() => vivo && setErro("Sem conexão com o servidor. Tentando de novo."));
      consultar();
      reserva = window.setInterval(consultar, INTERVALO_RESERVA);
    };

    const desligarReserva = () => {
      if (reserva === null) return;
      window.clearInterval(reserva);
      reserva = null;
    };

    let fonte: EventSource | null = null;
    let quedas: number[] = [];
    let novaTentativa: number | null = null;

    const abrirFluxo = () => {
      fonte = new EventSource("/api/ativos");

      fonte.onopen = () => {
        if (!vivo) return;
        setModo("vivo");
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
        ligarReserva();

        const marco = Date.now();
        quedas = [...quedas.filter((q) => marco - q < JANELA_DE_QUEDAS), marco];
        if (quedas.length >= QUEDAS_ATE_DESISTIR) {
          fonte?.close();
          setModo("reserva");
          // Desistir não é para sempre: daqui a pouco tenta o fluxo de novo.
          if (novaTentativa === null) {
            novaTentativa = window.setTimeout(() => {
              novaTentativa = null;
              if (!vivo) return;
              quedas = [];
              abrirFluxo();
            }, NOVA_TENTATIVA_FLUXO);
          }
        } else {
          setModo("reconectando");
        }
      };
    };

    abrirFluxo();

    return () => {
      vivo = false;
      desligarReserva();
      if (novaTentativa !== null) window.clearTimeout(novaTentativa);
      fonte?.close();
    };
  }, [aplicar]);

  // Pulso dos cronômetros: só redesenha, o valor vem da diferença de datas.
  useEffect(() => {
    const pulso = window.setInterval(() => forcarRedesenho((n) => n + 1), 500);
    return () => window.clearInterval(pulso);
  }, []);

  const agoraCorrigido = () => new Date(Date.now() + desvioRelogio.current);

  const totais = somarEmAberto(base, agoraCorrigido());

  return (
    <>
      <div className="painel-topo">
        <h1 className="painel-titulo">{consultaApenas ? "Consulta de OS" : "Dashboard"}</h1>
        {/* Estado da conexão só aparece quando há o que avisar. */}
        {modo === "reconectando" && <span className="reconectando">Reconectando…</span>}
        {modo === "reserva" && (
          <span className="reconectando reconectando--reserva">Atualizando a cada 15 s</span>
        )}
      </div>

      <BuscaOs
        sessoesAoVivo={sessoes}
        agoraCorrigido={agoraCorrigido}
        revisao={revisao}
        aoMudarBusca={setBuscaAtiva}
        consultaApenas={consultaApenas}
      />

      {erro && <p className="erro">{erro}</p>}

      {/* Durante a busca o painel sai de cena para não competir. */}
      {!buscaAtiva && !consultaApenas && (
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

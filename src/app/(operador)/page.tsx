"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Modal from "@/components/Modal";
import Icone from "@/components/Icone";
import { finalizar, iniciar, obterEstado, parar, retomar } from "../actions";
import { lerEtapaConfigurada } from "@/lib/maquina";
import { diferencaEmSegundos, formatarDuracao } from "@/lib/tempo";
import type { EstadoEtapa } from "@/lib/tipos";

type Situacao = "PARADO" | "EM_ANDAMENTO" | "PAUSADO";

/** De quanto em quanto tempo o estado é reconferido no banco. */
const INTERVALO_SINCRONIA = 30_000;

/**
 * Tela do operador, uma etapa de cada vez.
 *
 * Nada de mostrar os seis controles juntos com quatro deles apagados: o
 * operador vê só o que pode fazer agora. Parado, a tela pede a OS e oferece
 * Iniciar. Rodando, vira cronômetro com Parar e Finalizar. O motivo da parada
 * e a confirmação de fim acontecem em diálogo, no momento em que importam.
 */
export default function TelaOperador() {
  const router = useRouter();

  const [etapaId, setEtapaId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoEtapa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [os, setOs] = useState("");
  const [motivo, setMotivo] = useState("");
  const [pedindoMotivo, setPedindoMotivo] = useState(false);
  const [confirmandoFim, setConfirmandoFim] = useState(false);

  // Diferença entre o relógio do servidor e o do navegador. O cronômetro é
  // sempre now() + desvio - segmento_inicio: nunca um contador incremental.
  const desvioRelogio = useRef(0);
  const [, forcarRedesenho] = useState(0);

  const sincronizar = useCallback(async (id: string) => {
    const novo = await obterEstado(id);
    desvioRelogio.current = new Date(novo.agora).getTime() - Date.now();
    setEstado(novo);
    return novo;
  }, []);

  // Carga inicial: o identificador salvo no localStorage diz qual etapa abrir;
  // a etapa então consulta o banco para saber se há apontamento em curso.
  useEffect(() => {
    const id = lerEtapaConfigurada();
    if (!id) {
      router.replace("/configurar");
      return;
    }
    setEtapaId(id);
    sincronizar(id)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, [router, sincronizar]);

  // Reconfere o estado periodicamente e sempre que a aba volta ao primeiro
  // plano — o tempo correu no banco enquanto o navegador esteve fechado.
  useEffect(() => {
    if (!etapaId) return;

    const revalidar = () => {
      sincronizar(etapaId).catch(() => {
        /* falha momentânea: o cronômetro segue com o desvio anterior */
      });
    };
    const relogio = window.setInterval(revalidar, INTERVALO_SINCRONIA);
    const aoVoltar = () => {
      if (document.visibilityState === "visible") revalidar();
    };
    document.addEventListener("visibilitychange", aoVoltar);
    window.addEventListener("focus", revalidar);

    return () => {
      window.clearInterval(relogio);
      document.removeEventListener("visibilitychange", aoVoltar);
      window.removeEventListener("focus", revalidar);
    };
  }, [etapaId, sincronizar]);

  // Pulso do cronômetro: apenas redesenha; o valor vem da diferença de datas.
  useEffect(() => {
    const pulso = window.setInterval(() => forcarRedesenho((n) => n + 1), 500);
    return () => window.clearInterval(pulso);
  }, []);

  async function executar(
    acao: () => Promise<{ ok: boolean; erro?: string; dados?: EstadoEtapa }>
  ) {
    if (ocupado) return false;
    setOcupado(true);
    setErro(null);
    try {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir a ação.");
        if (etapaId) await sincronizar(etapaId);
        return false;
      }
      if (r.dados) {
        desvioRelogio.current = new Date(r.dados.agora).getTime() - Date.now();
        setEstado(r.dados);
      }
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  // ---- estados de carregamento / configuração -----------------------------

  if (carregando) {
    return (
      <main className="aviso-config">
        <p className="vazio">Carregando…</p>
      </main>
    );
  }

  if (erro && !estado) {
    return (
      <main className="aviso-config">
        <p className="op-aviso">{erro}</p>
      </main>
    );
  }

  if (!estado?.etapa || !estado.etapa.ativa) {
    return (
      <main className="aviso-config">
        <p className="op-aviso">
          {!estado?.etapa
            ? "A etapa configurada nesta máquina não existe mais."
            : `A etapa ${estado.etapa.nome} foi inativada.`}{" "}
          Escolha outra etapa para esta máquina.
        </p>
        <Link
          href="/configurar"
          className="op-botao op-botao--retomar"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            textDecoration: "none",
            marginTop: 14,
          }}
        >
          Trocar etapa
        </Link>
      </main>
    );
  }

  // ---- estado derivado ----------------------------------------------------

  const sessao = estado.sessao;
  const situacao: Situacao = !sessao ? "PARADO" : sessao.status;
  const pausado = situacao === "PAUSADO";

  const decorrido = sessao
    ? diferencaEmSegundos(sessao.segmento_inicio, new Date(Date.now() + desvioRelogio.current))
    : 0;

  // ---- ações --------------------------------------------------------------

  async function aoIniciar() {
    if (!etapaId) return;
    if (await executar(() => iniciar(etapaId, os))) setMotivo("");
  }

  async function aoParar() {
    if (!etapaId) return;
    if (await executar(() => parar(etapaId, motivo))) setPedindoMotivo(false);
  }

  async function aoRetomar() {
    if (!etapaId) return;
    if (await executar(() => retomar(etapaId))) setMotivo(""); // Retomar limpa o motivo.
  }

  async function aoFinalizar() {
    if (!etapaId) return;
    const ok = await executar(() => finalizar(etapaId));
    setConfirmandoFim(false);
    if (ok) {
      setOs("");
      setMotivo("");
    }
  }

  return (
    <main className="operador">
      <header className="op-cabecalho">
        <div className="op-cabecalho-esq">
          <Link
            href="/configurar"
            className="op-voltar"
            title="Trocar a etapa desta máquina"
            aria-label="Trocar a etapa desta máquina"
          >
            <Icone nome="setaEsquerda" tamanho={19} />
          </Link>
          <h1 className="op-etapa">{estado.etapa.nome}</h1>
        </div>
        <Link href="/painel" className="op-link-discreto" title="Painel de gestão">
          Painel
        </Link>
      </header>

      {erro && <p className="op-aviso">{erro}</p>}

      {situacao === "PARADO" ? (
        /* ---- nada em curso: só a OS e o Iniciar ---- */
        <form
          className="op-partida"
          onSubmit={(e) => {
            e.preventDefault();
            if (os.trim()) aoIniciar();
          }}
        >
          <p className="op-chamada">Digite o número da OS e clique em iniciar</p>

          <input
            className="op-campo op-campo--partida"
            type="text"
            inputMode="numeric"
            autoComplete="off"
            autoFocus
            placeholder="Número da OS"
            aria-label="Número da OS"
            value={os}
            onChange={(e) => setOs(e.target.value)}
          />

          <button
            type="submit"
            className="op-botao op-botao--iniciar"
            disabled={!os.trim() || ocupado}
          >
            Iniciar
          </button>
        </form>
      ) : (
        /* ---- em curso: o cronômetro manda na tela ---- */
        <section className="op-curso">
          <div className={`op-relogio ${pausado ? "op-relogio--pausado" : "op-relogio--ativo"}`}>
            <p className="op-relogio-os">{sessao?.numero_os}</p>
            <p className="op-relogio-tempo">{formatarDuracao(decorrido)}</p>
            <p className="op-relogio-situacao">{pausado ? "Parado" : "Em andamento"}</p>
            {pausado && sessao?.motivo && <p className="op-relogio-motivo">{sessao.motivo}</p>}
          </div>

          <div className="op-acoes">
            {pausado ? (
              <button
                type="button"
                className="op-botao op-botao--retomar"
                disabled={ocupado}
                onClick={aoRetomar}
              >
                Retomar
              </button>
            ) : (
              <button
                type="button"
                className="op-botao op-botao--parar"
                disabled={ocupado}
                onClick={() => {
                  setMotivo("");
                  setPedindoMotivo(true);
                }}
              >
                Parar
              </button>
            )}

            <button
              type="button"
              className="op-botao op-botao--finalizar"
              disabled={ocupado}
              onClick={() => setConfirmandoFim(true)}
            >
              Finalizar
            </button>
          </div>
        </section>
      )}

      {/* O motivo é pedido na hora de parar, não antes. */}
      {pedindoMotivo && (
        <Modal titulo="Por que a produção vai parar?" aoFechar={() => setPedindoMotivo(false)}>
          <textarea
            className="op-campo op-campo--motivo"
            rows={3}
            autoFocus
            placeholder="Ex.: troca de bobina, falta de material"
            aria-label="Motivo da parada"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
          />

          <div className="modal-acoes">
            <button
              type="button"
              className="op-botao"
              onClick={() => setPedindoMotivo(false)}
              disabled={ocupado}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="op-botao op-botao--parar"
              onClick={aoParar}
              disabled={!motivo.trim() || ocupado}
            >
              Parar
            </button>
          </div>
        </Modal>
      )}

      {confirmandoFim && (
        <Modal
          titulo="Deseja realmente finalizar o apontamento desta etapa?"
          aoFechar={() => setConfirmandoFim(false)}
        >
          <div className="modal-acoes">
            <button
              type="button"
              className="op-botao"
              onClick={() => setConfirmandoFim(false)}
              disabled={ocupado}
            >
              Não
            </button>
            <button
              type="button"
              className="op-botao op-botao--iniciar"
              onClick={aoFinalizar}
              disabled={ocupado}
            >
              Sim
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

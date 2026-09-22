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

export default function TelaOperador() {
  const router = useRouter();

  const [etapaId, setEtapaId] = useState<string | null>(null);
  const [estado, setEstado] = useState<EstadoEtapa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const [os, setOs] = useState("");
  const [motivo, setMotivo] = useState("");
  const [confirmando, setConfirmando] = useState(false);

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
        <p className="op-estado-texto">Carregando…</p>
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
        <Link href="/configurar" className="op-botao op-botao--retomar" style={{ display: "flex", alignItems: "center", justifyContent: "center", textDecoration: "none", marginTop: 14 }}>
          Trocar etapa
        </Link>
      </main>
    );
  }

  // ---- estado derivado ----------------------------------------------------

  const sessao = estado.sessao;
  const situacao: Situacao = !sessao ? "PARADO" : sessao.status;

  const osExibida = sessao ? sessao.numero_os : os;
  const motivoExibido = situacao === "PAUSADO" ? sessao?.motivo ?? "" : motivo;

  const osBloqueada = situacao !== "PARADO";
  const podeIniciar = situacao === "PARADO" && os.trim().length > 0;
  const motivoBloqueado = situacao !== "EM_ANDAMENTO";
  const podeParar = situacao === "EM_ANDAMENTO" && motivo.trim().length > 0;
  const podeRetomar = situacao === "PAUSADO";
  const podeFinalizar = situacao !== "PARADO";

  const decorrido = sessao
    ? diferencaEmSegundos(sessao.segmento_inicio, new Date(Date.now() + desvioRelogio.current))
    : 0;

  const rotuloSituacao =
    situacao === "PARADO" ? "Parado" : situacao === "EM_ANDAMENTO" ? "Em andamento" : "Pausado";

  const classeEstado =
    situacao === "EM_ANDAMENTO"
      ? "op-estado op-estado--andamento"
      : situacao === "PAUSADO"
      ? "op-estado op-estado--pausado"
      : "op-estado";

  // ---- ações --------------------------------------------------------------

  async function aoIniciar() {
    if (!etapaId) return;
    if (await executar(() => iniciar(etapaId, os))) setMotivo("");
  }

  async function aoParar() {
    if (!etapaId) return;
    await executar(() => parar(etapaId, motivo));
  }

  async function aoRetomar() {
    if (!etapaId) return;
    if (await executar(() => retomar(etapaId))) setMotivo(""); // Retomar limpa o motivo.
  }

  async function aoFinalizar() {
    if (!etapaId) return;
    const ok = await executar(() => finalizar(etapaId));
    setConfirmando(false);
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

      <div className="op-colunas">
        <section className="op-form">
          <div>
            <label className="op-rotulo" htmlFor="campo-os">
              OS
            </label>
            <input
              id="campo-os"
              className="op-campo"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              placeholder="Digite o número da OS"
              value={osExibida}
              disabled={osBloqueada}
              onChange={(e) => setOs(e.target.value)}
            />
          </div>

          <button
            type="button"
            className="op-botao op-botao--iniciar"
            disabled={!podeIniciar || ocupado}
            onClick={aoIniciar}
          >
            Iniciar
          </button>

          <div>
            <label className="op-rotulo" htmlFor="campo-motivo">
              Motivo da parada
            </label>
            <textarea
              id="campo-motivo"
              className="op-campo"
              rows={2}
              placeholder={motivoBloqueado ? "" : "Descreva o motivo para poder parar"}
              value={motivoExibido}
              disabled={motivoBloqueado}
              onChange={(e) => setMotivo(e.target.value)}
            />
          </div>

          <div className="op-dupla">
            <button
              type="button"
              className="op-botao op-botao--parar"
              disabled={!podeParar || ocupado}
              onClick={aoParar}
            >
              Parar
            </button>
            <button
              type="button"
              className="op-botao op-botao--retomar"
              disabled={!podeRetomar || ocupado}
              onClick={aoRetomar}
            >
              Retomar
            </button>
          </div>

          <button
            type="button"
            className="op-botao op-botao--finalizar"
            disabled={!podeFinalizar || ocupado}
            onClick={() => setConfirmando(true)}
          >
            Finalizar
          </button>
        </section>

        <section className={classeEstado} aria-live="polite">
          <p className="op-estado-faixa">Situação</p>
          <p className="op-estado-texto">{rotuloSituacao}</p>
          {situacao === "PAUSADO" && sessao?.motivo && (
            <p className="op-estado-motivo">{sessao.motivo}</p>
          )}
          <p className="op-cronometro">{formatarDuracao(decorrido)}</p>
          <p className="op-os-atual">{sessao ? `OS ${sessao.numero_os}` : "Nenhuma OS em curso"}</p>
        </section>
      </div>

      {confirmando && (
        <Modal
          titulo="Deseja realmente finalizar o apontamento desta etapa?"
          aoFechar={() => setConfirmando(false)}
        >
          <div className="modal-acoes">
            <button
              type="button"
              className="op-botao"
              onClick={() => setConfirmando(false)}
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

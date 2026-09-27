"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Icone from "@/components/Icone";
import type { NomeIcone } from "@/components/Icone";

export interface Acao {
  rotulo: string;
  icone: NomeIcone;
  aoEscolher: () => void;
  /** Vermelha e no fim da lista, separada do resto. */
  perigo?: boolean;
  impedida?: string;
}

interface Props {
  acoes: Acao[];
  rotulo: string;
}

const LARGURA = 190;
const FOLGA = 6;

/**
 * Engrenagem que abre a lista de ações da linha.
 *
 * Quatro botões por linha numa tabela viram uma parede de texto, e no celular
 * nem cabem. Aqui a linha mostra um alvo só e as opções aparecem quando são
 * pedidas, com ícone em cada uma, e a exclusão em vermelho, no fim, separada
 * das outras por uma linha, para não ser clicada por inércia.
 *
 * A lista é desenhada no `body`, não ao lado do botão: a tabela rola na
 * horizontal e qualquer `overflow` no caminho cortaria fora o que passasse da
 * borda. Por isso a posição é medida do botão e a lista é `fixed`.
 *
 * Teclado, como se espera de um menu: ao abrir, o foco vai para a primeira
 * opção; setas sobem e descem, Home e End vão às pontas, Esc fecha e devolve
 * o foco à engrenagem.
 */
export default function MenuAcoes({ acoes, rotulo }: Props) {
  const [aberto, setAberto] = useState(false);
  const [posicao, setPosicao] = useState({ top: 0, left: 0 });
  const alvo = useRef<HTMLButtonElement>(null);
  const lista = useRef<HTMLDivElement>(null);

  const medir = useCallback(() => {
    const botao = alvo.current;
    if (!botao) return;

    const r = botao.getBoundingClientRect();
    const altura = lista.current?.offsetHeight ?? 0;

    // Alinha a lista pela direita do botão e a mantém dentro da janela.
    const left = Math.max(FOLGA, Math.min(r.right - LARGURA, window.innerWidth - LARGURA - FOLGA));

    // Sem espaço embaixo, abre para cima.
    const cabeAbaixo = r.bottom + FOLGA + altura <= window.innerHeight - FOLGA;
    const top = cabeAbaixo ? r.bottom + FOLGA : Math.max(FOLGA, r.top - FOLGA - altura);

    setPosicao({ top, left });
  }, []);

  useLayoutEffect(() => {
    if (!aberto) return;
    medir();
    lista.current?.querySelector<HTMLButtonElement>("[role=menuitem]:not(:disabled)")?.focus();
  }, [aberto, medir]);

  useEffect(() => {
    if (!aberto) return;

    const aoTocarFora = (e: PointerEvent) => {
      const dentro =
        alvo.current?.contains(e.target as Node) || lista.current?.contains(e.target as Node);
      if (!dentro) setAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setAberto(false);
        alvo.current?.focus();
        return;
      }

      const itens = [
        ...(lista.current?.querySelectorAll<HTMLButtonElement>("[role=menuitem]:not(:disabled)") ?? []),
      ];
      if (itens.length === 0) return;
      const atual = itens.indexOf(document.activeElement as HTMLButtonElement);

      const destino =
        e.key === "ArrowDown" ? (atual + 1) % itens.length
        : e.key === "ArrowUp" ? (atual - 1 + itens.length) % itens.length
        : e.key === "Home" ? 0
        : e.key === "End" ? itens.length - 1
        : -1;

      if (destino >= 0) {
        e.preventDefault();
        itens[destino].focus();
      }
    };

    document.addEventListener("pointerdown", aoTocarFora);
    document.addEventListener("keydown", aoTeclar);
    // `capture` para ouvir também a rolagem da tabela, não só a da janela.
    window.addEventListener("scroll", medir, true);
    window.addEventListener("resize", medir);

    return () => {
      document.removeEventListener("pointerdown", aoTocarFora);
      document.removeEventListener("keydown", aoTeclar);
      window.removeEventListener("scroll", medir, true);
      window.removeEventListener("resize", medir);
    };
  }, [aberto, medir]);

  const comuns = acoes.filter((a) => !a.perigo);
  const perigosas = acoes.filter((a) => a.perigo);

  function item(a: Acao) {
    return (
      <button
        key={a.rotulo}
        type="button"
        role="menuitem"
        className={`menu-item ${a.perigo ? "menu-item--perigo" : ""}`}
        disabled={Boolean(a.impedida)}
        title={a.impedida}
        onClick={() => {
          setAberto(false);
          a.aoEscolher();
        }}
      >
        <Icone nome={a.icone} tamanho={16} />
        {a.rotulo}
      </button>
    );
  }

  return (
    <>
      <button
        ref={alvo}
        type="button"
        className={`menu-alvo ${aberto ? "menu-alvo--aberto" : ""}`}
        aria-label={`Ações de ${rotulo}`}
        aria-haspopup="menu"
        aria-expanded={aberto}
        onClick={() => setAberto((v) => !v)}
      >
        <Icone nome="engrenagem" tamanho={18} />
      </button>

      {aberto &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={lista}
            className="menu-lista"
            role="menu"
            aria-label={`Ações de ${rotulo}`}
            style={{ top: posicao.top, left: posicao.left, width: LARGURA }}
          >
            {comuns.map(item)}
            {perigosas.length > 0 && <span className="menu-divisor" aria-hidden="true" />}
            {perigosas.map(item)}
          </div>,
          document.body
        )}
    </>
  );
}

"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
  /**
   * "centro" é o diálogo comum; "inferior" sobe do rodapé, que é o gesto
   * esperado num celular, fica ao alcance do polegar.
   */
  variante?: "centro" | "inferior";
}

/**
 * Modal renderizado por portal direto no `<body>`.
 *
 * Isso não é detalhe de organização: qualquer ancestral com animação de
 * `transform` vira bloco de contenção e faz o `position: fixed` do fundo se
 * medir por ele, e não pela janela. Foi o que deixou o escurecido cobrindo
 * só o miolo da tela. Saindo da árvore, o fundo cobre a janela inteira.
 */
export default function Modal({ titulo, aoFechar, children, variante = "centro" }: Props) {
  const [montado, setMontado] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);

  // `aoFechar` costuma chegar como função nova a cada render. Guardada numa
  // ref, os efeitos abaixo rodam uma vez só: antes, na tela do operador, que
  // redesenha a cada meio segundo, os ouvintes e a trava de rolagem eram
  // desfeitos e refeitos duas vezes por segundo.
  const aoFecharAtual = useRef(aoFechar);
  useLayoutEffect(() => {
    aoFecharAtual.current = aoFechar;
  });

  useEffect(() => setMontado(true), []);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") aoFecharAtual.current();
    };
    document.addEventListener("keydown", aoTeclar);

    // Trava a rolagem do fundo enquanto o modal está aberto.
    const rolagemAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagemAnterior;
    };
  }, []);

  // Foco: entra no diálogo ao abrir e volta para onde estava ao fechar. Quem
  // usa teclado ou leitor de tela não fica perdido atrás do escurecido.
  useEffect(() => {
    if (!montado) return;
    const antes = document.activeElement as HTMLElement | null;

    // Um campo com `autoFocus` dentro do diálogo já pegou o foco; só quando
    // nada lá dentro o tem é que a própria caixa o recebe.
    if (caixa.current && !caixa.current.contains(document.activeElement)) {
      caixa.current.focus();
    }

    return () => {
      if (antes && document.contains(antes)) antes.focus();
    };
  }, [montado]);

  if (!montado) return null;

  return createPortal(
    <div
      className={`modal-fundo ${variante === "inferior" ? "modal-fundo--inferior" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) aoFecharAtual.current();
      }}
    >
      <div
        ref={caixa}
        tabIndex={-1}
        className={`modal-caixa ${variante === "inferior" ? "modal-caixa--inferior" : ""}`}
      >
        {variante === "inferior" && <span className="modal-puxador" aria-hidden="true" />}
        <h2 className="modal-titulo">{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}

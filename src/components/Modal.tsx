"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";

interface Props {
  titulo: string;
  aoFechar: () => void;
  children: React.ReactNode;
  /**
   * "centro" é o diálogo comum; "inferior" sobe do rodapé, que é o gesto
   * esperado num celular — fica ao alcance do polegar.
   */
  variante?: "centro" | "inferior";
}

/**
 * Modal renderizado por portal direto no `<body>`.
 *
 * Isso não é detalhe de organização: qualquer ancestral com animação de
 * `transform` vira bloco de contenção e faz o `position: fixed` do fundo se
 * medir por ele, e não pela janela — foi o que deixou o escurecido cobrindo
 * só o miolo da tela. Saindo da árvore, o fundo cobre a janela inteira.
 */
export default function Modal({ titulo, aoFechar, children, variante = "centro" }: Props) {
  const [montado, setMontado] = useState(false);

  useEffect(() => setMontado(true), []);

  const fechar = useCallback(() => aoFechar(), [aoFechar]);

  useEffect(() => {
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fechar();
    };
    document.addEventListener("keydown", aoTeclar);

    // Trava a rolagem do fundo enquanto o modal está aberto.
    const rolagemAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = rolagemAnterior;
    };
  }, [fechar]);

  if (!montado) return null;

  return createPortal(
    <div
      className={`modal-fundo ${variante === "inferior" ? "modal-fundo--inferior" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label={titulo}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) fechar();
      }}
    >
      <div className={`modal-caixa ${variante === "inferior" ? "modal-caixa--inferior" : ""}`}>
        {variante === "inferior" && <span className="modal-puxador" aria-hidden="true" />}
        <h2 className="modal-titulo">{titulo}</h2>
        {children}
      </div>
    </div>,
    document.body
  );
}

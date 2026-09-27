"use client";

import { useEffect, useId, useRef, useState } from "react";
import Icone from "./Icone";

interface Props {
  /** O texto da explicação. Frase curta: a caixa não é lugar de parágrafo. */
  children: React.ReactNode;
  /** Para quem lê por leitor de tela: o que esta dica explica. */
  sobre: string;
}

/**
 * Dica de canto: um "i" que abre a explicação ao passar o mouse ou tocar.
 *
 * É um botão, não um `title` do navegador, por dois motivos: o `title` só
 * aparece depois de um segundo parado com o mouse em cima, e no celular não
 * aparece nunca. Aqui o toque abre e o toque fora fecha.
 */
export default function Dica({ children, sobre }: Props) {
  const [aberta, setAberta] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  const id = useId();

  // Tocar em qualquer outro lugar fecha, como se espera de uma caixa flutuante.
  useEffect(() => {
    if (!aberta) return;

    const aoTocarFora = (e: PointerEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberta(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") setAberta(false);
    };

    document.addEventListener("pointerdown", aoTocarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoTocarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [aberta]);

  return (
    <span className="dica" ref={caixa}>
      <button
        type="button"
        className="dica-alvo"
        aria-label={`O que é ${sobre}`}
        aria-expanded={aberta}
        aria-describedby={aberta ? id : undefined}
        onClick={(e) => {
          // O nome inteiro costuma ser clicável; a dica não dispara a ação.
          e.stopPropagation();
          e.preventDefault();
          setAberta((v) => !v);
        }}
        onPointerEnter={() => setAberta(true)}
        onPointerLeave={() => setAberta(false)}
        onFocus={() => setAberta(true)}
        onBlur={() => setAberta(false)}
      >
        <Icone nome="info" tamanho={15} />
      </button>

      {aberta && (
        <span className="dica-balao" id={id} role="tooltip">
          {children}
        </span>
      )}
    </span>
  );
}

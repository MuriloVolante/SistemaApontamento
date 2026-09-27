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
 * aparece nunca.
 *
 * Cada jeito de apontar tem o seu gesto, e só um: o mouse abre ao passar por
 * cima, o dedo abre e fecha tocando, o teclado abre ao chegar pelo Tab. Com os
 * três valendo ao mesmo tempo, no computador o passar do mouse abria e o
 * clique logo em seguida fechava.
 */
export default function Dica({ children, sobre }: Props) {
  const [aberta, setAberta] = useState(false);
  const caixa = useRef<HTMLSpanElement>(null);
  /** Com o que foi o último toque no "i": mouse, dedo ou caneta. */
  const ponteiro = useRef<string>("mouse");
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
        onPointerEnter={(e) => e.pointerType === "mouse" && setAberta(true)}
        onPointerLeave={(e) => e.pointerType === "mouse" && setAberta(false)}
        onPointerDown={(e) => {
          ponteiro.current = e.pointerType;
        }}
        onClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
          // Com o mouse ela já abriu ao passar por cima; clicar não a fecha.
          if (ponteiro.current === "mouse") setAberta(true);
          else setAberta((v) => !v);
        }}
        // Só o foco que veio do teclado abre: o toque também foca o botão, e
        // abriria aqui para o clique fechar logo depois.
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && setAberta(true)}
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

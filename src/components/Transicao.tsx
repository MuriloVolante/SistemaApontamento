"use client";

import { useRef } from "react";
import { usePathname } from "next/navigation";

interface Props {
  /** Rotas na ordem em que aparecem. Define para que lado a tela desliza. */
  ordem: string[];
  children: React.ReactNode;
}

/**
 * Troca de tela deslizante.
 *
 * Só a tela que entra é animada. A primeira versão mantinha também a tela
 * que saía, para imitar a troca de área de trabalho — mas as duas camadas
 * ficavam sobrepostas a poucos pixels e o resultado era texto fantasma, não
 * deslize. Fazer aquilo direito exigiria travar a rolagem, congelar a altura
 * e recortar na janela; não compensa numa tela de chão de fábrica.
 *
 * O sentido vem da posição das rotas em `ordem`: avançar entra pela direita,
 * voltar entra pela esquerda.
 */
export default function Transicao({ ordem, children }: Props) {
  const caminho = usePathname();
  const anterior = useRef(caminho);

  const posicao = (c: string) => {
    const i = ordem.indexOf(c);
    return i === -1 ? ordem.length : i;
  };

  const voltando = posicao(caminho) < posicao(anterior.current);
  anterior.current = caminho;

  return (
    // A chave troca a cada rota: o React monta um nó novo e a animação de
    // entrada roda de novo.
    <div
      key={caminho}
      className={`transicao ${voltando ? "transicao--voltando" : "transicao--avancando"}`}
    >
      {children}
    </div>
  );
}

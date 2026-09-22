"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

interface Props {
  /** Rotas na ordem em que aparecem. Define para que lado a tela desliza. */
  ordem: string[];
  children: React.ReactNode;
}

/** Precisa bater com a duração da animação no CSS. */
const DURACAO = 380;

interface Camada {
  caminho: string;
  conteudo: React.ReactNode;
}

/**
 * Troca de tela deslizante, no espírito de trocar de área de trabalho: a tela
 * que sai escorrega para um lado enquanto a que entra chega do outro, as duas
 * com um leve recuo de escala que dá a sensação de profundidade.
 *
 * O sentido vem da posição das rotas em `ordem`: avançar joga para a
 * esquerda, voltar joga para a direita. Enquanto a animação corre, as duas
 * telas ficam montadas; a que saiu é descartada no fim.
 */
export default function Transicao({ ordem, children }: Props) {
  const caminho = usePathname();

  const [atual, setAtual] = useState<Camada>({ caminho, conteudo: children });
  const [saindo, setSaindo] = useState<Camada | null>(null);
  const [voltando, setVoltando] = useState(false);

  // Guarda o estado corrente para o efeito não depender dele e reexecutar à toa.
  const atualRef = useRef(atual);
  atualRef.current = atual;

  useEffect(() => {
    const anterior = atualRef.current;

    // Mesma rota: só o conteúdo foi atualizado, não há o que animar.
    if (caminho === anterior.caminho) {
      if (children !== anterior.conteudo) setAtual({ caminho, conteudo: children });
      return;
    }

    const posicao = (c: string) => {
      const i = ordem.indexOf(c);
      return i === -1 ? ordem.length : i;
    };

    setVoltando(posicao(caminho) < posicao(anterior.caminho));
    setSaindo(anterior);
    setAtual({ caminho, conteudo: children });

    const relogio = window.setTimeout(() => setSaindo(null), DURACAO);
    return () => window.clearTimeout(relogio);
  }, [caminho, children, ordem]);

  const sentido = voltando ? "transicao--voltando" : "transicao--avancando";

  return (
    <div className={`transicao ${sentido}`}>
      {saindo && (
        <div className="transicao-camada transicao-camada--saindo" aria-hidden="true">
          {saindo.conteudo}
        </div>
      )}
      <div key={atual.caminho} className="transicao-camada transicao-camada--entrando">
        {atual.conteudo}
      </div>
    </div>
  );
}

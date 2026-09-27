"use client";

import { useEffect } from "react";

/** Nome da janela quando a tela não tem um mais específico a dizer. */
const PADRAO = "Sistema de Apontamento";

/**
 * Escreve o título da aba do navegador.
 *
 * Com dezoito computadores abertos no chão de fábrica, a aba é o que
 * distingue um do outro na barra de tarefas, e "Sistema de Apontamento" em
 * todos eles não dizia nada. Cada máquina passa a mostrar o próprio nome.
 *
 * O observador existe porque o Next reaplica o `<title>` do layout sempre que
 * uma ação de servidor faz a rota se revalidar: sem ele, iniciar ou finalizar
 * um apontamento devolvia a aba ao nome genérico. Escrever de novo só quando o
 * valor difere evita que a nossa própria alteração acorde o observador em laço.
 *
 * Sem limpeza ao desmontar de propósito: todas as telas chamam este hook, e a
 * seguinte escreve o próprio título. Voltar ao padrão no meio do caminho só
 * faria a aba piscar.
 */
export default function useTituloJanela(titulo: string | null | undefined): void {
  useEffect(() => {
    const desejado = titulo?.trim() || PADRAO;

    const aplicar = () => {
      if (document.title !== desejado) document.title = desejado;
    };
    aplicar();

    const alvo = document.querySelector("title");
    if (!alvo) return;

    const observador = new MutationObserver(aplicar);
    observador.observe(alvo, { childList: true, characterData: true, subtree: true });
    return () => observador.disconnect();
  }, [titulo]);
}

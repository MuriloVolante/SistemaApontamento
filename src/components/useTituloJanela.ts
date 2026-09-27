"use client";

import { useEffect } from "react";

/** Nome da janela quando a tela não tem um mais específico a dizer. */
const PADRAO = "Sistema de Apontamento";

/**
 * Escreve o título da aba do navegador.
 *
 * Com dezoito computadores abertos no chão de fábrica, a aba é o que
 * distingue um do outro na barra de tarefas — e "Sistema de Apontamento" em
 * todos eles não dizia nada. Cada máquina passa a mostrar o próprio nome.
 *
 * Sem limpeza ao desmontar de propósito: todas as telas chamam este hook, e
 * a seguinte escreve o próprio título. Voltar ao padrão no meio do caminho só
 * faria a aba piscar.
 */
export default function useTituloJanela(titulo: string | null | undefined): void {
  useEffect(() => {
    document.title = titulo?.trim() || PADRAO;
  }, [titulo]);
}

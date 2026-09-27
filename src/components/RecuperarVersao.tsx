"use client";

import { useEffect } from "react";

const CHAVE = "mautus.recarga-versao";
/** Recarga mais recente que esta é sinal de laço, e não de aba velha. */
const JANELA = 15_000;

function ehPedacoPerdido(erro: unknown): boolean {
  const e = erro as { name?: string; message?: string } | null;
  return (
    e?.name === "ChunkLoadError" ||
    /Loading (CSS )?chunk [\w-]+ failed/i.test(e?.message ?? "")
  );
}

/**
 * Recarrega a página quando a aba ficou de uma versão anterior do sistema.
 *
 * Cada compilação troca o nome dos arquivos de código. Uma aba que ficou
 * aberta de antes continua pedindo os nomes antigos, que não existem mais, e
 * a tela trava num erro de "chunk" até alguém apertar F5. Aqui o F5 é feito
 * sozinho, uma vez: se o erro voltar logo depois, não é aba velha, e recarregar
 * de novo só prenderia a tela num laço.
 */
export default function RecuperarVersao() {
  useEffect(() => {
    const recarregar = (erro: unknown) => {
      if (!ehPedacoPerdido(erro)) return;
      try {
        const ultima = Number(sessionStorage.getItem(CHAVE) ?? 0);
        if (Date.now() - ultima < JANELA) return;
        sessionStorage.setItem(CHAVE, String(Date.now()));
      } catch {
        /* sem sessionStorage, recarrega assim mesmo */
      }
      window.location.reload();
    };

    const aoErro = (e: ErrorEvent) => recarregar(e.error ?? { message: e.message });
    const aoRejeitar = (e: PromiseRejectionEvent) => recarregar(e.reason);
    window.addEventListener("error", aoErro);
    window.addEventListener("unhandledrejection", aoRejeitar);
    return () => {
      window.removeEventListener("error", aoErro);
      window.removeEventListener("unhandledrejection", aoRejeitar);
    };
  }, []);

  return null;
}

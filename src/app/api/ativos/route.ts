import { assinar } from "@/lib/transmissor";

/** Fluxo aberto: precisa rodar em Node, sem cache e sem pré-renderização. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comentário SSE periódico, só para o canal não ser derrubado por ociosidade. */
const INTERVALO_BATIMENTO = 25_000;

/**
 * Fluxo de eventos do dashboard (SSE). O navegador abre uma vez e o servidor
 * empurra cada mudança — nada de ficar perguntando de tempos em tempos nem de
 * atualizar a página na mão. O EventSource reconecta sozinho se a conexão cair.
 */
export async function GET(requisicao: Request): Promise<Response> {
  const codificador = new TextEncoder();

  const fluxo = new ReadableStream<Uint8Array>({
    start(controlador) {
      let aberto = true;

      const enviar = (texto: string) => {
        if (!aberto) return;
        try {
          controlador.enqueue(codificador.encode(texto));
        } catch {
          aberto = false;
        }
      };

      const cancelarAssinatura = assinar((dados) => {
        enviar(`data: ${JSON.stringify(dados)}\n\n`);
      });

      const batimento = setInterval(() => enviar(": batimento\n\n"), INTERVALO_BATIMENTO);

      const encerrar = () => {
        if (!aberto) return;
        aberto = false;
        clearInterval(batimento);
        cancelarAssinatura();
        try {
          controlador.close();
        } catch {
          /* já fechado pelo cliente */
        }
      };

      requisicao.signal.addEventListener("abort", encerrar);
    },
  });

  return new Response(fluxo, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      // Evita que um proxy reverso segure o fluxo em buffer.
      "X-Accel-Buffering": "no",
    },
  });
}

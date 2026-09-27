import { assinar } from "@/lib/transmissor";
import { validarSessao } from "@/lib/sessao";

/** Fluxo aberto: precisa rodar em Node, sem cache e sem pré-renderização. */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Comentário SSE periódico, só para o canal não ser derrubado por ociosidade. */
const INTERVALO_BATIMENTO = 25_000;

/**
 * Fluxo de eventos do dashboard (SSE). O navegador abre uma vez e o servidor
 * empurra cada mudança, nada de ficar perguntando de tempos em tempos nem de
 * atualizar a página na mão. O EventSource reconecta sozinho se a conexão cair.
 */
export async function GET(requisicao: Request): Promise<Response> {
  // O fluxo carrega o que está rodando em todas as máquinas: é dado do
  // painel, e painel exige sessão conferida no banco. Um usuário inativado ou
  // com a senha resetada deixa de receber já na próxima reconexão.
  if (!(await validarSessao())) {
    return new Response("Sem sessão.", { status: 401 });
  }

  const codificador = new TextEncoder();

  // Fora do `start` para o `cancel` também alcançar: o fluxo precisa ser
  // desmontado por qualquer um dos três caminhos, senão a assinatura e o
  // relógio ficam vivos para sempre, lendo o banco para ninguém.
  let encerrar = () => {};

  const fluxo = new ReadableStream<Uint8Array>({
    start(controlador) {
      let aberto = true;
      let batimento: ReturnType<typeof setInterval> | null = null;
      let cancelarAssinatura: (() => void) | null = null;

      encerrar = () => {
        if (!aberto) return;
        aberto = false;
        if (batimento) clearInterval(batimento);
        cancelarAssinatura?.();
        try {
          controlador.close();
        } catch {
          /* já fechado pelo cliente */
        }
      };

      const enviar = (texto: string) => {
        if (!aberto) return;
        try {
          controlador.enqueue(codificador.encode(texto));
        } catch {
          // 1. O envio falhou: o outro lado já foi embora.
          encerrar();
        }
      };

      cancelarAssinatura = assinar((dados) => {
        enviar(`data: ${JSON.stringify(dados)}\n\n`);
      });

      batimento = setInterval(() => enviar(": batimento\n\n"), INTERVALO_BATIMENTO);

      // 2. O navegador fechou a conexão e a requisição foi abortada.
      requisicao.signal.addEventListener("abort", () => encerrar());
    },

    // 3. Quem consome o fluxo desistiu dele, com ou sem `abort`.
    cancel() {
      encerrar();
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

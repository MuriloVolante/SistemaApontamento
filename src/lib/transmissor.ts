import { agora, repositorio } from "./repositorio";
import type { AtualizacaoAoVivo } from "./tipos";

/**
 * Difusor de mudanças para o dashboard.
 *
 * Existe **um** relógio no servidor lendo o banco, não um por navegador
 * conectado: com 18 máquinas abertas continua sendo uma leitura por segundo no
 * total. A leitura é barata (duas consultas sobre tabelas minúsculas — há no
 * máximo uma sessão por etapa) e o pacote só é enviado quando muda de verdade,
 * então uma tela parada não gera tráfego nenhum.
 */
type Assinante = (dados: AtualizacaoAoVivo) => void;

const INTERVALO_LEITURA = 1000;

const assinantes = new Set<Assinante>();
let relogio: ReturnType<typeof setInterval> | null = null;
let ultimoEnvio: string | null = null;

async function lerEstado(): Promise<AtualizacaoAoVivo> {
  const repo = await repositorio();
  const [sessoes, revisaoApontamentos] = await Promise.all([
    repo.listarSessoesAtivas(),
    repo.contarApontamentos(),
  ]);
  return { sessoes, revisaoApontamentos, agora: agora().toISOString() };
}

/** Compara ignorando `agora`, que muda a cada leitura por definição. */
function assinatura(d: AtualizacaoAoVivo): string {
  return JSON.stringify({ s: d.sessoes, r: d.revisaoApontamentos });
}

async function verificar(): Promise<void> {
  let dados: AtualizacaoAoVivo;
  try {
    dados = await lerEstado();
  } catch {
    // Falha momentânea de leitura: a próxima volta tenta de novo.
    return;
  }

  const atual = assinatura(dados);
  if (atual === ultimoEnvio) return;

  ultimoEnvio = atual;
  for (const assinante of assinantes) assinante(dados);
}

/**
 * Registra um ouvinte e devolve a função que o remove. O primeiro assinante
 * liga o relógio; a saída do último o desliga.
 */
export function assinar(assinante: Assinante): () => void {
  assinantes.add(assinante);
  const primeiro = assinantes.size === 1;

  if (!relogio) relogio = setInterval(verificar, INTERVALO_LEITURA);

  // Estado atual imediatamente, para a tela não nascer vazia.
  lerEstado()
    .then((d) => {
      assinante(d);
      // Quem liga o relógio também registra a assinatura do que acabou de
      // enviar, senão o primeiro tique repetiria o mesmo pacote.
      if (primeiro) ultimoEnvio = assinatura(d);
    })
    .catch(() => {
      /* o relógio manda o estado na próxima volta */
    });

  return () => {
    assinantes.delete(assinante);
    if (assinantes.size === 0 && relogio) {
      clearInterval(relogio);
      relogio = null;
    }
  };
}

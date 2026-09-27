/**
 * Freio para quem tenta adivinhar senha.
 *
 * Cinco erros seguidos no mesmo usuário (e no mesmo endereço, quando o
 * servidor o conhece) bloqueiam aquele par por um minuto. Guardado em memória:
 * o sistema roda num processo só, e reiniciar o servidor zerar a contagem não
 * é problema para um freio de um minuto.
 */
const LIMITE = 5;
const BLOQUEIO_MS = 60_000;

interface Registro {
  falhas: number;
  bloqueadoAte: number;
}

const registros = new Map<string, Registro>();

function limparVencidos(agora: number): void {
  for (const [chave, r] of registros) {
    if (r.bloqueadoAte && r.bloqueadoAte <= agora) registros.delete(chave);
  }
}

/** Quantos segundos faltam de bloqueio para esta chave, ou 0. */
export function segundosDeBloqueio(chave: string): number {
  const agora = Date.now();
  limparVencidos(agora);
  const r = registros.get(chave);
  if (!r || r.bloqueadoAte <= agora) return 0;
  return Math.ceil((r.bloqueadoAte - agora) / 1000);
}

export function registrarFalha(chave: string): void {
  const r = registros.get(chave) ?? { falhas: 0, bloqueadoAte: 0 };
  r.falhas += 1;
  if (r.falhas >= LIMITE) r.bloqueadoAte = Date.now() + BLOQUEIO_MS;
  registros.set(chave, r);
}

export function registrarSucesso(chave: string): void {
  registros.delete(chave);
}

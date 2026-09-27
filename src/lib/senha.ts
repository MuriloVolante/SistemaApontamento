import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { TAMANHO_MINIMO } from "./regras-senha";

export { SENHA_PADRAO, TAMANHO_MINIMO } from "./regras-senha";

const CUSTO = { N: 16384, r: 8, p: 1 };
const BYTES = 32;

/**
 * Guarda a senha como `scrypt$sal$hash`.
 *
 * scrypt vem do próprio Node: nada de dependência nova, e é deliberadamente
 * lento, de modo que quem levasse o arquivo do banco embora não conseguiria
 * testar senhas em massa. O sal é sorteado por senha, então duas pessoas com a
 * mesma senha não produzem o mesmo registro.
 */
export function embaralhar(senha: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, BYTES, CUSTO);
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

/** Confere a senha digitada contra o que está guardado. */
export function conferir(senha: string, guardado: string): boolean {
  const [algoritmo, salHex, hashHex] = guardado.split("$");
  if (algoritmo !== "scrypt" || !salHex || !hashHex) return false;

  const esperado = Buffer.from(hashHex, "hex");
  const obtido = scryptSync(senha, Buffer.from(salHex, "hex"), esperado.length, CUSTO);

  // Comparação de tempo constante: um `===` vazaria, pelo tempo de resposta,
  // quantos caracteres do hash estavam certos.
  return timingSafeEqual(esperado, obtido);
}

/**
 * Valida a senha nova e a confirmação. Devolve a mensagem de erro, ou null
 * quando está tudo certo.
 */
export function criticarSenhaNova(nova: string, confirmacao: string): string | null {
  if (nova.length < TAMANHO_MINIMO) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`;
  }
  if (nova !== confirmacao) return "As duas senhas não são iguais.";
  return null;
}

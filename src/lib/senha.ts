import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { SENHA_PADRAO, TAMANHO_MINIMO } from "./regras-senha";

export { SENHA_PADRAO, TAMANHO_MINIMO } from "./regras-senha";

const CUSTO = { N: 16384, r: 8, p: 1 };
const BYTES = 32;

/**
 * scrypt assíncrono. A versão síncrona segura o processo inteiro por uns
 * 50 ms a cada login: nesse tempo o fluxo ao vivo do painel e todas as outras
 * ações ficam paradas esperando.
 */
function derivar(senha: string, sal: Buffer, tamanho: number): Promise<Buffer> {
  return new Promise((ok, falha) => {
    scrypt(senha, sal, tamanho, CUSTO, (erro, chave) => (erro ? falha(erro) : ok(chave)));
  });
}

/**
 * Guarda a senha como `scrypt$sal$hash`.
 *
 * scrypt vem do próprio Node: nada de dependência nova, e é deliberadamente
 * lento, de modo que quem levasse o arquivo do banco embora não conseguiria
 * testar senhas em massa. O sal é sorteado por senha, então duas pessoas com a
 * mesma senha não produzem o mesmo registro.
 */
export async function embaralhar(senha: string): Promise<string> {
  const sal = randomBytes(16);
  const hash = await derivar(senha, sal, BYTES);
  return `scrypt$${sal.toString("hex")}$${hash.toString("hex")}`;
}

/** Confere a senha digitada contra o que está guardado. */
export async function conferir(senha: string, guardado: string): Promise<boolean> {
  const [algoritmo, salHex, hashHex] = guardado.split("$");
  if (algoritmo !== "scrypt" || !salHex || !hashHex) return false;

  // Hex malformado vira Buffer vazio, e scrypt com tamanho zero estoura.
  const esperado = Buffer.from(hashHex, "hex");
  if (esperado.length === 0) return false;

  const obtido = await derivar(senha, Buffer.from(salHex, "hex"), esperado.length);

  // Comparação de tempo constante: um `===` vazaria, pelo tempo de resposta,
  // quantos caracteres do hash estavam certos.
  return timingSafeEqual(esperado, obtido);
}

/**
 * Hash que não corresponde a senha nenhuma, no mesmo formato e custo dos
 * verdadeiros. Quando o usuário digitado não existe, a senha é conferida
 * contra ele mesmo assim: sem isso a resposta sairia na hora para nome
 * inexistente e depois do scrypt para nome existente, e o tempo entregaria
 * quem tem cadastro.
 */
export const HASH_FICTICIO =
  "scrypt$5f1d9c0a7e3b42c8a6d0e4f1b2c3d4e5$" +
  "8a1f3c5e7b9d2f4a6c8e0b1d3f5a7c9e2b4d6f8a0c1e3b5d7f9a2c4e6b8d0f1a";

/**
 * Valida a senha nova e a confirmação. Devolve a mensagem de erro, ou null
 * quando está tudo certo.
 *
 * Fora o tamanho mínimo, uma exceção só: a senha nova não pode ser a padrão,
 * senão a pessoa "trocaria" a senha que todo mundo conhece por ela mesma e
 * sairia da troca obrigatória com ela.
 */
export function criticarSenhaNova(nova: string, confirmacao: string): string | null {
  if (nova.length < TAMANHO_MINIMO) {
    return `A senha precisa ter pelo menos ${TAMANHO_MINIMO} caracteres.`;
  }
  if (nova === SENHA_PADRAO) return "Escolha uma senha diferente da senha padrão.";
  if (nova !== confirmacao) return "As duas senhas não são iguais.";
  return null;
}

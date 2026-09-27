/**
 * Constantes da senha, num arquivo sem nada do Node.
 *
 * `senha.ts` usa `node:crypto` e por isso não pode ser importado por uma tela,
 * porque o pacote do navegador não tem crypto do Node. Só que a tela precisa dizer
 * "pelo menos N caracteres" e "a senha volta a ser tal", e repetir os valores
 * na mão é como eles acabam divergindo. Ficam aqui, para os dois lados lerem.
 */

/** Senha de todo usuário recém-criado e de todo reset. */
export const SENHA_PADRAO = "senha12345";

/** Única exigência sobre a senha nova, conforme combinado. */
export const TAMANHO_MINIMO = 6;

/**
 * Regras de texto das entradas, num arquivo sem nada do Node: o servidor
 * valida com elas e as telas usam os mesmos números no `maxLength`.
 */

/** Tamanho máximo de cada entrada, conferido no servidor. */
export const LIMITES = {
  /** Número da OS, como o operador digita. */
  os: 30,
  /** Motivo da parada, texto livre (regra 3). */
  motivo: 300,
  /** Nome de etapa e nome de usuário. */
  nome: 60,
} as const;

/**
 * Chave com que dois nomes são comparados.
 *
 * "Corte" e "corte" são a mesma etapa, e "JOÃO" e "joão" o mesmo usuário. O
 * SQLite só sabe ignorar maiúsculas em letras sem acento, e o Postgres depende
 * da configuração de idioma do banco; então a regra é uma só, aplicada aqui, e
 * os dois bancos guardam o resultado numa coluna com índice único.
 *
 * O NFC junta as duas formas que um "ã" pode chegar do teclado (uma letra só,
 * ou "a" seguido do til) numa só.
 */
export function chaveDeNome(nome: string): string {
  return nome.trim().normalize("NFC").toLocaleLowerCase("pt-BR");
}

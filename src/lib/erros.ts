import { unstable_rethrow } from "next/navigation";

/** O que a tela mostra quando algo falha sem que a pessoa tenha culpa. */
const MENSAGEM =
  "Não foi possível concluir agora. Tente de novo; se continuar, avise o responsável pelo sistema.";

/**
 * Resposta para um erro inesperado numa ação do servidor.
 *
 * O texto do banco ("SQLITE_BUSY", "violates foreign key constraint...") não
 * serve para quem está na tela e ainda descreve a estrutura por dentro. Ele
 * vai para o console do servidor, onde quem cuida do sistema o encontra, e a
 * tela recebe uma frase que diz o que fazer.
 *
 * Um redirecionamento do Next também chega aqui como exceção quando cai
 * dentro de um `try`; `unstable_rethrow` o devolve para o Next seguir com ele.
 */
export function falhaInesperada(onde: string, erro: unknown): { ok: false; erro: string } {
  unstable_rethrow(erro);
  console.error(`[${onde}]`, erro);
  return { ok: false, erro: MENSAGEM };
}

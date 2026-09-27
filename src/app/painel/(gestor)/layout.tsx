import { exigirGestor } from "@/lib/sessao";

/**
 * Histórico, Etapas e Usuários: só gestor.
 *
 * A conferência é aqui, no servidor, antes de a tela existir. Quando era na
 * tela, a página de gestor chegava a montar para o vendedor, chamava a ação,
 * a ação recusava, o erro piscava e só então vinha o redirecionamento.
 *
 * O parêntese no nome da pasta é só organização: não entra na URL, que
 * continua /painel/historico, /painel/etapas e /painel/usuarios.
 */
export default async function LayoutGestor({ children }: { children: React.ReactNode }) {
  await exigirGestor();
  return <>{children}</>;
}

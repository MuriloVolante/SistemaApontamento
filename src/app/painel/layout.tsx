import { redirect } from "next/navigation";
import { validarSessao } from "@/lib/sessao";
import NavPainel from "./NavPainel";

/**
 * Porta do painel de gestão.
 *
 * Roda no servidor: a sessão é conferida no banco antes de a tela existir,
 * então o navegador nunca chega a receber o conteúdo de quem não entrou. O
 * nome e o perfil passados adiante são os de agora, lidos do banco, e não os
 * guardados no cookie na hora do login: gestor rebaixado perde as abas de
 * gestor na próxima navegação, vendedor promovido as ganha.
 *
 * Quem está com a senha ainda provisória volta ao login, porque a sessão
 * dele só serve para definir a senha.
 *
 * A tela de apontamento fica de fora disto de propósito: ela continua sem
 * login, como manda a regra 7 do sistema.
 */
export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const usuario = await validarSessao();
  if (!usuario) redirect("/login");

  return <NavPainel usuario={usuario}>{children}</NavPainel>;
}

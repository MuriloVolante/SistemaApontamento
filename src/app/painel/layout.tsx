import { redirect } from "next/navigation";
import { lerSessao } from "@/lib/sessao";
import NavPainel from "./NavPainel";

/**
 * Porta do painel de gestão.
 *
 * Roda no servidor: a sessão é conferida antes de a tela existir, então o
 * navegador nunca chega a receber o conteúdo de quem não entrou. Quem está com
 * a senha ainda provisória volta ao login, porque a sessão dele só serve para
 * definir a senha.
 *
 * A tela de apontamento fica de fora disto de propósito: ela continua sem
 * login, como manda a primeira regra do sistema.
 */
export default async function LayoutPainel({ children }: { children: React.ReactNode }) {
  const sessao = await lerSessao();
  if (!sessao || sessao.trocar) redirect("/login");

  return (
    <NavPainel usuario={{ id: sessao.id, nome: sessao.nome, tipo: sessao.tipo }}>
      {children}
    </NavPainel>
  );
}

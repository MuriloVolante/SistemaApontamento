"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const PAGINAS = [
  { href: "/painel", rotulo: "Dashboard" },
  { href: "/painel/historico", rotulo: "Histórico" },
  { href: "/painel/etapas", rotulo: "Etapas" },
  { href: "/painel/relatorios", rotulo: "Relatórios" },
];

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();

  return (
    <>
      <nav className="navbar">
        <div className="navbar-interna">
          <span className="navbar-marca">Apontamento</span>

          <ul className="navbar-itens">
            {PAGINAS.map((p) => {
              // "/painel" só fica ativo na raiz; as demais, no seu prefixo.
              const ativo = p.href === "/painel" ? caminho === p.href : caminho.startsWith(p.href);
              return (
                <li key={p.href}>
                  <Link href={p.href} className={`navbar-link ${ativo ? "navbar-link--ativo" : ""}`}>
                    {p.rotulo}
                  </Link>
                </li>
              );
            })}
          </ul>

          <Link href="/" className="navbar-saida">
            Tela de apontamento
          </Link>
        </div>
      </nav>

      <main className="painel">{children}</main>
    </>
  );
}

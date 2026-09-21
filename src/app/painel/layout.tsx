"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import Icone from "@/components/Icone";

const PAGINAS = [
  { href: "/painel", rotulo: "Dashboard" },
  { href: "/painel/historico", rotulo: "Histórico" },
  { href: "/painel/etapas", rotulo: "Etapas" },
];

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();

  return (
    <>
      <nav className="navbar">
        <div className="navbar-interna">
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

          <Link
            href="/"
            className="navbar-saida"
            title="Tela de apontamento"
            aria-label="Ir para a tela de apontamento"
          >
            <Icone nome="setaEsquerda" tamanho={19} />
          </Link>
        </div>
      </nav>

      {/* A chave muda a cada rota: o React remonta o bloco e a animação de
          entrada roda de novo. A navbar, fora daqui, fica parada. */}
      <main className="painel" key={caminho}>
        <div className="pagina">{children}</div>
      </main>
    </>
  );
}

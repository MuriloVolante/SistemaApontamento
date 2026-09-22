"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import Icone from "@/components/Icone";
import Transicao from "@/components/Transicao";

const PAGINAS = [
  { href: "/painel", rotulo: "Dashboard" },
  { href: "/painel/historico", rotulo: "Histórico" },
  { href: "/painel/etapas", rotulo: "Etapas" },
];

const ORDEM = PAGINAS.map((p) => p.href);

export default function LayoutPainel({ children }: { children: React.ReactNode }) {
  const caminho = usePathname();

  // "/painel" só fica ativo na raiz; as demais, no seu prefixo.
  const ativo =
    PAGINAS.find((p) => (p.href === "/painel" ? caminho === p.href : caminho.startsWith(p.href)))
      ?.href ?? "/painel";

  const lista = useRef<HTMLUListElement>(null);
  const abas = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [marca, setMarca] = useState({ x: 0, largura: 0, pronta: false });

  /**
   * O sublinhado é um elemento só, que escorrega e se estica de uma aba até a
   * outra em vez de aparecer e sumir. É o que dá a sensação de continuidade
   * entre as telas.
   */
  const medir = useCallback(() => {
    const aba = abas.current[ativo];
    const caixa = lista.current;
    if (!aba || !caixa) return;

    setMarca({
      x: aba.offsetLeft - caixa.scrollLeft,
      largura: aba.offsetWidth,
      pronta: true,
    });
  }, [ativo]);

  useLayoutEffect(medir, [medir]);

  useEffect(() => {
    const caixa = lista.current;
    window.addEventListener("resize", medir);
    caixa?.addEventListener("scroll", medir, { passive: true });
    return () => {
      window.removeEventListener("resize", medir);
      caixa?.removeEventListener("scroll", medir);
    };
  }, [medir]);

  return (
    <>
      <nav className="navbar">
        <div className="navbar-interna">
          <ul className="navbar-itens" ref={lista}>
            {PAGINAS.map((p) => (
              <li key={p.href}>
                <Link
                  href={p.href}
                  ref={(el) => {
                    abas.current[p.href] = el;
                  }}
                  className={`navbar-link ${p.href === ativo ? "navbar-link--ativo" : ""}`}
                >
                  {p.rotulo}
                </Link>
              </li>
            ))}

            <span
              className={`navbar-marca ${marca.pronta ? "navbar-marca--pronta" : ""}`}
              style={{ transform: `translateX(${marca.x}px)`, width: marca.largura }}
              aria-hidden="true"
            />
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

      <main className="painel">
        <Transicao ordem={ORDEM}>{children}</Transicao>
      </main>
    </>
  );
}

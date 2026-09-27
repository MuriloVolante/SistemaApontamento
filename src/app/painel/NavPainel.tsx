"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sair } from "../acesso";
import Icone from "@/components/Icone";
import Transicao from "@/components/Transicao";
import useTituloJanela from "@/components/useTituloJanela";
import { ProvedorUsuario } from "./ContextoUsuario";
import type { SessaoUsuario } from "@/lib/tipos";

/** O vendedor só tem a primeira; o gestor tem todas. */
const PAGINAS = [
  { href: "/painel", rotulo: "Dashboard", sóGestor: false },
  { href: "/painel/historico", rotulo: "Histórico", sóGestor: true },
  { href: "/painel/etapas", rotulo: "Etapas", sóGestor: true },
  { href: "/painel/usuarios", rotulo: "Usuários", sóGestor: true },
];

const ORDEM = PAGINAS.map((p) => p.href);

interface Props {
  usuario: SessaoUsuario;
  children: React.ReactNode;
}

export default function NavPainel({ usuario, children }: Props) {
  const caminho = usePathname();
  const router = useRouter();

  const gestor = usuario.tipo === "GESTOR";

  // Para o vendedor a mesma tela é outra coisa: ele não vê painel do dia
  // nenhum, vê a consulta. O rótulo acompanha o que a tela realmente mostra.
  const paginas = PAGINAS.filter((p) => gestor || !p.sóGestor).map((p) =>
    !gestor && p.href === "/painel" ? { ...p, rotulo: "Consulta de OS" } : p
  );

  /**
   * Vendedor que chegue a outra tela pela URL volta ao dashboard.
   *
   * Isto é conveniência, não segurança: quem guarda o acesso de verdade são
   * as ações do servidor, que conferem o perfil antes de devolver qualquer
   * dado. Esconder a aba nunca foi proteção.
   */
  useEffect(() => {
    if (!gestor && caminho !== "/painel") router.replace("/painel");
  }, [gestor, caminho, router]);

  // "/painel" só fica ativo na raiz; as demais, no seu prefixo.
  const ativo =
    paginas.find((p) => (p.href === "/painel" ? caminho === p.href : caminho.startsWith(p.href)))
      ?.href ?? "/painel";

  useTituloJanela(paginas.find((p) => p.href === ativo)?.rotulo);

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
            {paginas.map((p) => (
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

          <div className="navbar-conta">
            <span className="navbar-usuario" title={gestor ? "Gestor" : "Vendedor"}>
              <Icone nome="usuario" tamanho={16} />
              {usuario.nome}
            </span>

            <Link
              href="/"
              className="navbar-saida"
              title="Tela de apontamento"
              aria-label="Ir para a tela de apontamento"
            >
              <Icone nome="setaEsquerda" tamanho={19} />
            </Link>

            <button
              type="button"
              className="navbar-saida"
              title="Sair da conta"
              aria-label="Sair da conta"
              onClick={async () => {
                await sair();
                router.replace("/login");
              }}
            >
              <Icone nome="sair" tamanho={19} />
            </button>
          </div>
        </div>
      </nav>

      <main className="painel">
        <Transicao ordem={ORDEM}>
          <ProvedorUsuario usuario={usuario}>{children}</ProvedorUsuario>
        </Transicao>
      </main>
    </>
  );
}

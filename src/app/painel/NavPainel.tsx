"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { sair } from "../acesso";
import Icone from "@/components/Icone";
import Marca from "@/components/Marca";
import Transicao from "@/components/Transicao";
import useTituloJanela from "@/components/useTituloJanela";
import { ProvedorUsuario } from "./ContextoUsuario";
import TrocarSenha from "./TrocarSenha";
import type { SessaoUsuario } from "@/lib/tipos";

/** O vendedor só tem a primeira; o gestor tem todas. */
const PAGINAS = [
  { href: "/painel", rotulo: "Dashboard", soGestor: false },
  { href: "/painel/historico", rotulo: "Histórico", soGestor: true },
  { href: "/painel/etapas", rotulo: "Etapas", soGestor: true },
  { href: "/painel/usuarios", rotulo: "Usuários", soGestor: true },
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
  const paginas = PAGINAS.filter((p) => gestor || !p.soGestor).map((p) =>
    !gestor && p.href === "/painel" ? { ...p, rotulo: "Consulta de OS" } : p
  );

  // "/painel" só fica ativo na raiz; as demais, no seu prefixo.
  const ativo =
    paginas.find((p) => (p.href === "/painel" ? caminho === p.href : caminho.startsWith(p.href)))
      ?.href ?? "/painel";

  useTituloJanela(paginas.find((p) => p.href === ativo)?.rotulo);

  const [trocandoSenha, setTrocandoSenha] = useState(false);

  // Menu de três linhas, que substitui as abas no celular. Fecha ao escolher,
  // ao tocar fora ou com Esc, como toda janela suspensa.
  const [menuAberto, setMenuAberto] = useState(false);
  const ancoraMenu = useRef<HTMLDivElement>(null);
  const botaoMenu = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (!menuAberto) return;
    const aoTocarFora = (e: PointerEvent) => {
      if (!ancoraMenu.current?.contains(e.target as Node)) setMenuAberto(false);
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenuAberto(false);
        botaoMenu.current?.focus();
      }
    };
    document.addEventListener("pointerdown", aoTocarFora);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("pointerdown", aoTocarFora);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [menuAberto]);

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
          <Link href="/painel" className="navbar-logo" aria-label="Mautus, início do painel">
            <Marca altura={26} />
          </Link>

          {/* Só aparece no celular, no lugar das abas: os nomes não cabiam e
              encostavam nos botões da conta. */}
          <div className="navbar-menu-ancora" ref={ancoraMenu}>
            <button
              ref={botaoMenu}
              type="button"
              className="navbar-menu"
              aria-label="Telas do painel"
              aria-haspopup="menu"
              aria-expanded={menuAberto}
              onClick={() => setMenuAberto((v) => !v)}
            >
              <Icone nome="menu" tamanho={20} />
            </button>

            {menuAberto && (
              <div className="menu-lista navbar-menu-lista" role="menu" aria-label="Telas do painel">
                {paginas.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    role="menuitem"
                    aria-current={p.href === ativo ? "page" : undefined}
                    className={`menu-item ${p.href === ativo ? "menu-item--atual" : ""}`}
                    onClick={() => setMenuAberto(false)}
                  >
                    {p.rotulo}
                  </Link>
                ))}
              </div>
            )}
          </div>

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
            <button
              type="button"
              className="navbar-usuario"
              title={`${usuario.nome} (${gestor ? "gestor" : "vendedor"}): trocar minha senha`}
              aria-label="Trocar minha senha"
              onClick={() => setTrocandoSenha(true)}
            >
              <Icone nome="usuario" tamanho={16} />
              <span className="navbar-usuario-nome">{usuario.nome}</span>
            </button>

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

      {trocandoSenha && <TrocarSenha aoFechar={() => setTrocandoSenha(false)} />}

      <main className="painel">
        <Transicao ordem={ORDEM}>
          <ProvedorUsuario usuario={usuario}>{children}</ProvedorUsuario>
        </Transicao>
      </main>
    </>
  );
}

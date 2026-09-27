"use client";

import { createContext, useContext } from "react";
import type { SessaoUsuario } from "@/lib/tipos";

const Contexto = createContext<SessaoUsuario | null>(null);

export function ProvedorUsuario({
  usuario,
  children,
}: {
  usuario: SessaoUsuario;
  children: React.ReactNode;
}) {
  return <Contexto.Provider value={usuario}>{children}</Contexto.Provider>;
}

/**
 * Quem está no painel, para as telas decidirem o que mostrar.
 *
 * Vem de cima, do layout que já conferiu a sessão no servidor, assim nenhuma
 * tela precisa perguntar de novo. Serve para montar a tela, nunca para
 * autorizar: quem autoriza são as ações do servidor.
 */
export function useUsuario(): SessaoUsuario {
  const usuario = useContext(Contexto);
  if (!usuario) throw new Error("useUsuario só funciona dentro do painel.");
  return usuario;
}

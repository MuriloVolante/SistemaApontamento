"use client";

import Transicao from "@/components/Transicao";

/**
 * Grupo de rotas do operador: a tela de apontamento e a escolha da etapa.
 * O parêntese no nome da pasta é só organização — não entra na URL.
 *
 * Existe para as duas telas compartilharem a mesma transição deslizante.
 */
const ORDEM = ["/configurar", "/"];

export default function LayoutOperador({ children }: { children: React.ReactNode }) {
  return <Transicao ordem={ORDEM}>{children}</Transicao>;
}

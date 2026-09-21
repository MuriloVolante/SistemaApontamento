/**
 * Ícones no traço do Iconoir (MIT) — geométricos, de linha fina e uniforme.
 *
 * Os caminhos ficam embutidos aqui em vez de virem de uma biblioteca: são
 * poucos, não acrescentam dependência nem peso ao pacote, e a aplicação roda
 * offline. Todos usam a mesma grade de 24 e herdam a cor do texto.
 */
const DESENHOS = {
  setaEsquerda: <path d="M21 12H3m6-6-6 6 6 6" />,
  lupa: (
    <>
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  relogio: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7v5.2l3.2 2" />
    </>
  ),
  operacao: <path d="M7.5 5.4v13.2a.7.7 0 0 0 1.07.6l10.3-6.6a.7.7 0 0 0 0-1.2L8.57 4.8a.7.7 0 0 0-1.07.6Z" />,
  pausa: (
    <>
      <path d="M9.2 5v14M14.8 5v14" />
    </>
  ),
  filtro: <path d="M3.5 5h17l-6.6 7.6V19l-3.8 2v-8.4L3.5 5Z" />,
  relatorio: (
    <>
      <path d="M14 3v4.5a1 1 0 0 0 1 1h4.5" />
      <path d="M19.5 8.5V19a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2H14l5.5 5.5Z" />
      <path d="M8.5 13h7M8.5 16.5h4.5" />
    </>
  ),
  caixa: (
    <>
      <path d="M21 8.2 12 3.3 3 8.2v7.6l9 4.9 9-4.9V8.2Z" />
      <path d="m3 8.2 9 4.9 9-4.9M12 13.1V21" />
    </>
  ),
  fechar: <path d="m6.5 6.5 11 11m0-11-11 11" />,
  etapa: (
    <>
      <path d="M4 6.5h6.5M13.5 6.5H20M4 17.5h6.5M13.5 17.5H20" />
      <circle cx="12" cy="6.5" r="2" />
      <circle cx="12" cy="17.5" r="2" />
    </>
  ),
} as const;

export type NomeIcone = keyof typeof DESENHOS;

interface Props {
  nome: NomeIcone;
  tamanho?: number;
  className?: string;
}

export default function Icone({ nome, tamanho = 18, className }: Props) {
  const preenchido = nome === "operacao";

  return (
    <svg
      className={className}
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill={preenchido ? "currentColor" : "none"}
      stroke={preenchido ? "none" : "currentColor"}
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {DESENHOS[nome]}
    </svg>
  );
}

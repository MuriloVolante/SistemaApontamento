/**
 * Ícones no traço do Iconoir (MIT): geométricos, de linha fina e uniforme.
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
  info: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r="0.85" fill="currentColor" stroke="none" />
    </>
  ),
  /* Dentes de topo chato, gerados sobre a grade de 24: uma estrela de oito
     pontas -- que era o desenho anterior -- lê como explosão, não como peça. */
  engrenagem: (
    <>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M10.57 4.64L10.09 2.18L13.91 2.18L13.43 4.64L16.19 5.78L17.59 3.71L20.29 6.41L18.22 7.81L19.36 10.57L21.82 10.09L21.82 13.91L19.36 13.43L18.22 16.19L20.29 17.59L17.59 20.29L16.19 18.22L13.43 19.36L13.91 21.82L10.09 21.82L10.57 19.36L7.81 18.22L6.41 20.29L3.71 17.59L5.78 16.19L4.64 13.43L2.18 13.91L2.18 10.09L4.64 10.57L5.78 7.81L3.71 6.41L6.41 3.71L7.81 5.78Z" />
    </>
  ),
  /* Perfil de acesso: um crachá. */
  cracha: (
    <>
      <rect x="3.4" y="5.6" width="17.2" height="13.4" rx="2.2" />
      <circle cx="9" cy="11.4" r="2.1" />
      <path d="M5.9 16.4a3.6 3.6 0 0 1 6.2 0M14.8 10.6h3.6M14.8 14h2.4" />
    </>
  ),
  usuario: (
    <>
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20.5a7.5 7.5 0 0 1 15 0" />
    </>
  ),
  lapis: (
    <>
      <path d="M14.4 5.6 18.4 9.6M4 20l1-4.2L16.1 4.7a1.6 1.6 0 0 1 2.3 0l1 1a1.6 1.6 0 0 1 0 2.3L8.2 19Z" />
    </>
  ),
  chave: (
    <>
      <circle cx="7.5" cy="14.5" r="3.7" />
      <path d="m10.3 12 8-8M16.4 5.9l2 2M14.2 8.1l2 2" />
    </>
  ),
  lixeira: (
    <>
      <path d="M4.5 6.5h15M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.6 6.5 7.6 19a1.6 1.6 0 0 0 1.6 1.5h5.6A1.6 1.6 0 0 0 16.4 19l1-12.5" />
      <path d="M10.4 10v7M13.6 10v7" />
    </>
  ),
  desligar: (
    <>
      <path d="M12 3.5v8" />
      <path d="M17.4 6.6a7.5 7.5 0 1 1-10.8 0" />
    </>
  ),
  cadeado: (
    <>
      <rect x="4.2" y="10.2" width="15.6" height="10.3" rx="2.2" />
      <path d="M8 10.2V7.6a4 4 0 0 1 8 0v2.6" />
    </>
  ),
  sair: (
    <>
      <path d="M14.5 3.5h3.3a2 2 0 0 1 2 2v13a2 2 0 0 1-2 2h-3.3" />
      <path d="M11 8.5 14.5 12 11 15.5M14.5 12H4" />
    </>
  ),
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

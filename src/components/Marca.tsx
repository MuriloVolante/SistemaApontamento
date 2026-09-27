import { LOGOTIPO, SIMBOLO } from "@/lib/marca";

interface Props {
  /** "logotipo" é o nome inteiro; "simbolo", só o focinho e o bigode. */
  forma?: "logotipo" | "simbolo";
  /** Altura em pixels; a largura segue a proporção do desenho. */
  altura: number;
  className?: string;
}

/**
 * A marca Mautus desenhada na cor do texto em volta (`currentColor`): branca
 * na navbar escura, grafite na tela de entrada, sem precisar de dois arquivos.
 */
export default function Marca({ forma = "logotipo", altura, className }: Props) {
  const desenho = forma === "logotipo" ? LOGOTIPO : SIMBOLO;
  const [, , w, h] = desenho.viewBox.split(" ").map(Number);

  return (
    <svg
      className={className}
      viewBox={desenho.viewBox}
      width={Math.round((altura * w) / h)}
      height={altura}
      fill="currentColor"
      role="img"
      aria-label="Mautus"
    >
      {desenho.caminhos.map((d, i) => (
        <path key={i} d={d} fillRule="evenodd" clipRule="evenodd" />
      ))}
    </svg>
  );
}

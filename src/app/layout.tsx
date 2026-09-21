import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

/**
 * IBM Plex Sans — desenho industrial, conservador e de leitura excelente em
 * tela. Os arquivos ficam no próprio repositório (`src/fontes`), não em CDN:
 * a aplicação roda no chão de fábrica e precisa funcionar sem internet.
 *
 * Os números usam esta mesma fonte com algarismos tabulares: o zero é limpo,
 * sem ponto no meio, e os dígitos têm largura fixa, então o cronômetro não
 * muda de tamanho a cada segundo.
 */
const plexSans = localFont({
  src: [{ path: "../fontes/plex-sans-var.woff2", weight: "400 700", style: "normal" }],
  variable: "--fonte-texto",
  display: "swap",
  fallback: ["Segoe UI", "system-ui", "Roboto", "Arial", "sans-serif"],
});

export const metadata: Metadata = {
  title: "Sistema de Apontamento",
  description: "Apontamento de tempo de operação e parada por etapa de produção.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#152833",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={plexSans.variable}>
      <body>{children}</body>
    </html>
  );
}

/**
 * O localStorage guarda apenas o identificador da etapa configurada nesta
 * máquina. Nada de estado do apontamento nem de tempo decorrido: isso vive
 * na tabela `sessoes`, na nuvem, e é recalculado a cada abertura.
 */
const CHAVE = "apontamento.etapa_id";

export function lerEtapaConfigurada(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(CHAVE);
  } catch {
    return null;
  }
}

export function gravarEtapaConfigurada(etapaId: string): void {
  try {
    window.localStorage.setItem(CHAVE, etapaId);
  } catch {
    /* navegador sem localStorage: a máquina precisará ser configurada de novo. */
  }
}

export function limparEtapaConfigurada(): void {
  try {
    window.localStorage.removeItem(CHAVE);
  } catch {
    /* nada a fazer */
  }
}

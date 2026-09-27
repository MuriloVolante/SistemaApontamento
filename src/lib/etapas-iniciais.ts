/**
 * Etapas criadas na primeira execução, quando o banco ainda está vazio: as
 * máquinas e os setores da gráfica. Depois disso quem manda é o cadastro do
 * painel, e esta lista não volta a ser consultada.
 *
 * Fonte única. O bloco de etapas do `supabase/schema.sql` é um espelho desta
 * lista, gerado a partir dela por `node scripts/espelhar-etapas.mjs`.
 */
export const ETAPAS_INICIAIS = [
  "GOSS",
  "Komori",
  "SM",
  "KBA",
  "Dobradeira MBO",
  "Dobradeira AR",
  "Laminação",
  "Corte/Vinco Automático",
  "Corte/Vinco Manual",
  "Alceadeira 10 gavetas",
  "Alceadeira 5 gavetas",
  "Alceadeira Torre",
  "Guilhotina 115 Tiger",
  "Guilhotina 115 [revisar]",
  "Guilhotina [revisar]",
  "Verniz Localizado",
  "Grampeador Miruna",
  "Desfoleadeira",
  "Máquina de aplicar vareta",
  "Cartucheira",
  "Máquina de copo 01",
  "Máquina de copo 02",
  "Máquina de copo 03",
  "Máquina de copo 04",
  "Máquina de balde 5L",
  "Coladeira PUR",
  "Shirincadeira Automática",
  "Shirincadeira manual",
  "Expedição",
  "Ricoh",
] as const;

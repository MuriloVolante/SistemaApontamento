import { dataLocalISO } from "./tempo";
import type { LinhaApontamento } from "./tipos";

/**
 * Um bloco de trabalho: a mesma OS, na mesma etapa, no mesmo dia.
 *
 * A tabela de apontamentos é um log de eventos — serve para auditoria, não
 * para decidir. Agrupada assim, ela responde direto o que o gestor pergunta:
 * quanto aquela OS consumiu naquela etapa, quanto disso foi parada e por quê.
 */
export interface GrupoOs {
  chave: string;
  numero_os: string;
  etapa_id: string;
  etapa_nome: string;
  /** Dia local, em `YYYY-MM-DD`. */
  dia: string;
  total: number;
  operacao: number;
  pausa: number;
  /** Percentual do tempo em operação, de 0 a 100. */
  percentualOperacao: number;
  /** Motivos de parada somados, do mais demorado para o menos. */
  motivos: Array<{ texto: string; segundos: number; vezes: number }>;
  /** Eventos que formam o bloco, em ordem cronológica. */
  eventos: LinhaApontamento[];
}

export type CriterioGrupo = "tempo" | "pausa";

/** Agrupa os eventos por OS + etapa + dia, preservando a ordem cronológica. */
export function agruparPorOsEtapa(linhas: LinhaApontamento[]): GrupoOs[] {
  const mapa = new Map<string, GrupoOs>();

  for (const l of linhas) {
    const dia = dataLocalISO(l.inicio);
    const chave = `${l.numero_os}|${l.etapa_id}|${dia}`;

    let grupo = mapa.get(chave);
    if (!grupo) {
      grupo = {
        chave,
        numero_os: l.numero_os,
        etapa_id: l.etapa_id,
        etapa_nome: l.etapa_nome,
        dia,
        total: 0,
        operacao: 0,
        pausa: 0,
        percentualOperacao: 0,
        motivos: [],
        eventos: [],
      };
      mapa.set(chave, grupo);
    }

    grupo.total += l.duracao_segundos;
    if (l.tipo === "OPERACAO") grupo.operacao += l.duracao_segundos;
    else grupo.pausa += l.duracao_segundos;
    grupo.eventos.push(l);
  }

  for (const grupo of mapa.values()) {
    grupo.eventos.sort((a, b) => a.inicio.localeCompare(b.inicio));
    grupo.percentualOperacao = grupo.total > 0 ? (grupo.operacao / grupo.total) * 100 : 0;
    grupo.motivos = somarMotivos(grupo.eventos);
  }

  return [...mapa.values()];
}

/** Junta paradas com a mesma justificativa: "banheiro" 3x vira uma linha. */
function somarMotivos(eventos: LinhaApontamento[]): GrupoOs["motivos"] {
  const mapa = new Map<string, { texto: string; segundos: number; vezes: number }>();

  for (const e of eventos) {
    if (e.tipo !== "PAUSA") continue;
    const texto = (e.justificativa ?? "").trim() || "Sem justificativa";
    const chave = texto.toLocaleLowerCase("pt-BR");

    const atual = mapa.get(chave) ?? { texto, segundos: 0, vezes: 0 };
    atual.segundos += e.duracao_segundos;
    atual.vezes += 1;
    mapa.set(chave, atual);
  }

  return [...mapa.values()].sort((a, b) => b.segundos - a.segundos);
}

/**
 * Ordena os blocos pelo que costuma puxar a atenção primeiro. Nunca pelo
 * número do registro, que no celular não diz nada.
 */
export function ordenarGrupos(grupos: GrupoOs[], criterio: CriterioGrupo): GrupoOs[] {
  const ordenados = [...grupos];

  if (criterio === "pausa") {
    // Pela fatia de ociosidade; empate desempata pelo tempo absoluto, senão
    // um bloco curtíssimo de 100% pausa subiria acima de uma parada longa.
    ordenados.sort(
      (a, b) => b.pausa / (b.total || 1) - a.pausa / (a.total || 1) || b.pausa - a.pausa
    );
  } else {
    ordenados.sort((a, b) => b.total - a.total);
  }

  return ordenados;
}

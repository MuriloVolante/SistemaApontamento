"use client";

import { useState } from "react";
import { criarEtapa, definirAtivaEtapa, excluirEtapa, renomearEtapa } from "@/app/actions";
import type { Etapa } from "@/lib/tipos";

interface Props {
  etapas: Etapa[];
  aoMudar: () => void;
}

/**
 * Gestão de etapas no rodapé do painel: listar, adicionar, renomear, inativar.
 * Etapa com apontamentos vinculados só pode ser inativada — a exclusão é
 * recusada pelo servidor. Etapa inativa some da tela do operador, mas segue
 * disponível nos filtros e nos relatórios.
 */
export default function GestaoEtapas({ etapas, aoMudar }: Props) {
  const [nova, setNova] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  async function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setOcupado(true);
    setErro(null);
    try {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir a ação.");
        return false;
      }
      aoMudar();
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function adicionar() {
    if (await executar(() => criarEtapa(nova))) setNova("");
  }

  async function salvarNome(id: string) {
    if (await executar(() => renomearEtapa(id, nomeEditado))) setEditandoId(null);
  }

  return (
    <section className="cartao">
      <h2 className="cartao-titulo">Gestão de etapas</h2>

      <div className="linha-acoes" style={{ marginBottom: 16 }}>
        <input
          className="campo"
          style={{ maxWidth: 320 }}
          type="text"
          placeholder="Nome da nova etapa"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") adicionar();
          }}
        />
        <button type="button" className="botao" onClick={adicionar} disabled={ocupado}>
          Adicionar
        </button>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <ul className="lista-etapas">
        {etapas.map((e) => (
          <li key={e.id}>
            {editandoId === e.id ? (
              <>
                <input
                  className="campo"
                  style={{ flex: "1 1 220px" }}
                  value={nomeEditado}
                  autoFocus
                  onChange={(ev) => setNomeEditado(ev.target.value)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") salvarNome(e.id);
                    if (ev.key === "Escape") setEditandoId(null);
                  }}
                />
                <button
                  type="button"
                  className="botao botao--pequeno"
                  onClick={() => salvarNome(e.id)}
                  disabled={ocupado}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="botao botao--neutro botao--pequeno"
                  onClick={() => setEditandoId(null)}
                >
                  Cancelar
                </button>
              </>
            ) : (
              <>
                <span className="etapa-nome">{e.nome}</span>
                {!e.ativa && <span className="etiqueta etiqueta--inativa">Inativa</span>}
                <button
                  type="button"
                  className="botao botao--neutro botao--pequeno"
                  onClick={() => {
                    setEditandoId(e.id);
                    setNomeEditado(e.nome);
                    setErro(null);
                  }}
                >
                  Renomear
                </button>
                <button
                  type="button"
                  className="botao botao--neutro botao--pequeno"
                  onClick={() => executar(() => definirAtivaEtapa(e.id, !e.ativa))}
                  disabled={ocupado}
                >
                  {e.ativa ? "Inativar" : "Reativar"}
                </button>
                <button
                  type="button"
                  className="botao botao--perigo botao--pequeno"
                  onClick={() => executar(() => excluirEtapa(e.id))}
                  disabled={ocupado}
                  title="Só é possível excluir etapas sem apontamentos"
                >
                  Excluir
                </button>
              </>
            )}
          </li>
        ))}
      </ul>

      {etapas.length === 0 && <p className="vazio">Nenhuma etapa cadastrada.</p>}
    </section>
  );
}

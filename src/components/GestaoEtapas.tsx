"use client";

import { useRef, useState } from "react";
import Modal from "./Modal";
import { criarEtapa, definirAtivaEtapa, excluirEtapa, renomearEtapa } from "@/app/actions";
import { LIMITES } from "@/lib/nomes";
import type { Etapa } from "@/lib/tipos";

interface Props {
  etapas: Etapa[];
  aoMudar: () => void;
}

/**
 * Gestão de etapas na tela Etapas do painel: listar, adicionar, renomear,
 * inativar e excluir. Etapa com apontamentos vinculados só pode ser inativada,
 * e a exclusão é recusada pelo servidor. Etapa inativa some da tela do
 * operador, mas segue disponível nos filtros e nos relatórios.
 */
export default function GestaoEtapas({ etapas, aoMudar }: Props) {
  const [nova, setNova] = useState("");
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [excluindo, setExcluindo] = useState<Etapa | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Trava lida na hora, e não do estado do render: Enter duas vezes seguidas
  // chegava as duas com `ocupado` ainda falso e criava a etapa em dobro.
  const trava = useRef(false);

  async function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    if (trava.current) return false;
    trava.current = true;
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
    } catch {
      setErro("Não foi possível falar com o servidor. Tente de novo.");
      return false;
    } finally {
      trava.current = false;
      setOcupado(false);
    }
  }

  async function adicionar() {
    if (!nova.trim()) return;
    if (await executar(() => criarEtapa(nova))) setNova("");
  }

  async function salvarNome(id: string) {
    if (await executar(() => renomearEtapa(id, nomeEditado))) setEditandoId(null);
  }

  async function confirmarExclusao(e: Etapa) {
    if (await executar(() => excluirEtapa(e.id))) setExcluindo(null);
  }

  return (
    <section className="cartao">
      <div className="linha-acoes linha-acoes--espacada">
        <input
          className="campo campo--estreito"
          type="text"
          placeholder="Nome da nova etapa"
          maxLength={LIMITES.nome}
          value={nova}
          onChange={(e) => setNova(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") adicionar();
          }}
        />
        <button
          type="button"
          className="botao"
          onClick={adicionar}
          disabled={ocupado || !nova.trim()}
        >
          Adicionar
        </button>
      </div>

      {/* Com o diálogo de exclusão aberto, o erro aparece só nele. */}
      {erro && !excluindo && <p className="erro">{erro}</p>}

      <ul className="lista-etapas">
        {etapas.map((e) => (
          <li key={e.id}>
            {editandoId === e.id ? (
              <>
                <input
                  className="campo campo--flexivel"
                  maxLength={LIMITES.nome}
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
                  disabled={ocupado || !nomeEditado.trim()}
                >
                  Salvar
                </button>
                <button
                  type="button"
                  className="botao botao--neutro botao--pequeno"
                  onClick={() => setEditandoId(null)}
                  disabled={ocupado}
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
                  disabled={ocupado}
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
                  onClick={() => {
                    setErro(null);
                    setExcluindo(e);
                  }}
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

      {excluindo && (
        <Modal titulo={`Excluir a etapa ${excluindo.nome}?`} aoFechar={() => setExcluindo(null)}>
          <p className="modal-texto">
            Não dá para desfazer. Só é possível excluir etapa que nunca teve apontamento; se ela
            já foi usada, prefira inativar.
          </p>
          {erro && <p className="erro">{erro}</p>}
          <div className="modal-acoes">
            <button
              type="button"
              className="botao botao--neutro"
              onClick={() => setExcluindo(null)}
              disabled={ocupado}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao botao--perigo"
              onClick={() => confirmarExclusao(excluindo)}
              disabled={ocupado}
            >
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}

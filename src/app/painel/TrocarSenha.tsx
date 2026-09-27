"use client";

import { useState } from "react";
import Modal from "@/components/Modal";
import { trocarPropriaSenha } from "../acesso";
import { TAMANHO_MINIMO } from "@/lib/regras-senha";

interface Props {
  aoFechar: () => void;
}

/**
 * Troca da própria senha, para quem já está no painel.
 *
 * Antes a única saída de quem queria outra senha era pedir a um gestor que a
 * resetasse. Pede a senha atual: uma aba esquecida aberta não pode bastar para
 * alguém tomar a conta. As outras sessões da pessoa caem; esta continua.
 */
export default function TrocarSenha({ aoFechar }: Props) {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [feito, setFeito] = useState(false);
  const [ocupado, setOcupado] = useState(false);

  async function salvar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await trocarPropriaSenha(atual, nova, confirmacao);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setFeito(true);
    } catch {
      setErro("Não foi possível falar com o servidor. Tente de novo.");
    } finally {
      setOcupado(false);
    }
  }

  if (feito) {
    return (
      <Modal titulo="Senha trocada" aoFechar={aoFechar}>
        <p className="modal-texto">
          A partir de agora entre com a senha nova. Se você estava logado em outro computador,
          aquela sessão foi encerrada.
        </p>
        <div className="modal-rodape">
          <button type="button" className="botao" onClick={aoFechar}>
            Fechar
          </button>
        </div>
      </Modal>
    );
  }

  return (
    <Modal titulo="Trocar minha senha" aoFechar={aoFechar}>
      <form
        className="formulario-senha"
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <label className="campo-rotulo" htmlFor="senha-atual">
          Senha atual
        </label>
        <input
          id="senha-atual"
          className="campo"
          type="password"
          autoComplete="current-password"
          autoFocus
          value={atual}
          onChange={(e) => setAtual(e.target.value)}
        />

        <label className="campo-rotulo" htmlFor="senha-nova">
          Nova senha, pelo menos {TAMANHO_MINIMO} caracteres
        </label>
        <input
          id="senha-nova"
          className="campo"
          type="password"
          autoComplete="new-password"
          value={nova}
          onChange={(e) => setNova(e.target.value)}
        />

        <label className="campo-rotulo" htmlFor="senha-confirma">
          Repita a nova senha
        </label>
        <input
          id="senha-confirma"
          className="campo"
          type="password"
          autoComplete="new-password"
          value={confirmacao}
          onChange={(e) => setConfirmacao(e.target.value)}
        />

        {erro && <p className="erro">{erro}</p>}

        <div className="modal-acoes">
          <button type="button" className="botao botao--neutro" onClick={aoFechar} disabled={ocupado}>
            Cancelar
          </button>
          <button type="submit" className="botao" disabled={ocupado || !atual || !nova}>
            {ocupado ? "Salvando…" : "Salvar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}

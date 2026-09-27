"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Icone from "@/components/Icone";
import useTituloJanela from "@/components/useTituloJanela";
import { definirSenha, entrar, precisaDefinirSenha } from "../acesso";
import { TAMANHO_MINIMO } from "@/lib/regras-senha";

type Etapa = "ENTRADA" | "NOVA_SENHA";

/**
 * Porta de entrada do painel.
 *
 * Duas etapas na mesma tela: a entrada e, quando a senha ainda é a provisória,
 * a definição da senha de verdade. Elas não são telas separadas porque é um
 * caminho só, e quem acabou de provar a senha provisória já está no meio dele.
 */
export default function TelaLogin() {
  const router = useRouter();
  useTituloJanela("Entrar");

  const [etapa, setEtapa] = useState<Etapa>("ENTRADA");
  const [nome, setNome] = useState("");
  const [senha, setSenha] = useState("");
  const [nova, setNova] = useState("");
  const [confirmacao, setConfirmacao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Quem recarregou a página no meio da troca de senha volta para onde parou.
  useEffect(() => {
    precisaDefinirSenha()
      .then((sim) => sim && setEtapa("NOVA_SENHA"))
      .catch(() => {
        /* sem sessão: a entrada normal serve */
      });
  }, []);

  async function aoEntrar() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await entrar(nome, senha);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      if (r.dados.trocarSenha) {
        setEtapa("NOVA_SENHA");
        setSenha("");
        return;
      }
      router.replace("/painel");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  async function aoDefinirSenha() {
    if (ocupado) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await definirSenha(nova, confirmacao);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      router.replace("/painel");
    } catch (e) {
      setErro((e as Error).message);
    } finally {
      setOcupado(false);
    }
  }

  return (
    <main className="entrada">
      <form
        className="entrada-cartao"
        onSubmit={(e) => {
          e.preventDefault();
          if (etapa === "ENTRADA") aoEntrar();
          else aoDefinirSenha();
        }}
      >
        <span className="entrada-selo" aria-hidden="true">
          <Icone nome="cadeado" tamanho={22} />
        </span>

        {etapa === "ENTRADA" ? (
          <>
            <h1 className="entrada-titulo">Painel de gestão</h1>
            <p className="entrada-texto">Entre com o seu usuário para continuar.</p>

            <label className="campo-rotulo" htmlFor="login-nome">
              Usuário
            </label>
            <input
              id="login-nome"
              className="campo"
              type="text"
              autoComplete="username"
              autoFocus
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />

            <label className="campo-rotulo" htmlFor="login-senha">
              Senha
            </label>
            <input
              id="login-senha"
              className="campo"
              type="password"
              autoComplete="current-password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
            />

            {erro && <p className="erro">{erro}</p>}

            <button type="submit" className="botao entrada-botao" disabled={ocupado}>
              {ocupado ? "Entrando…" : "Entrar"}
            </button>
          </>
        ) : (
          <>
            <h1 className="entrada-titulo">Crie a sua senha</h1>
            <p className="entrada-texto">
              Você entrou com a senha provisória. Escolha uma senha sua, de pelo menos{" "}
              {TAMANHO_MINIMO} caracteres.
            </p>

            <label className="campo-rotulo" htmlFor="nova-senha">
              Nova senha
            </label>
            <input
              id="nova-senha"
              className="campo"
              type="password"
              autoComplete="new-password"
              autoFocus
              value={nova}
              onChange={(e) => setNova(e.target.value)}
            />

            <label className="campo-rotulo" htmlFor="confirma-senha">
              Repita a nova senha
            </label>
            <input
              id="confirma-senha"
              className="campo"
              type="password"
              autoComplete="new-password"
              value={confirmacao}
              onChange={(e) => setConfirmacao(e.target.value)}
            />

            {erro && <p className="erro">{erro}</p>}

            <button type="submit" className="botao entrada-botao" disabled={ocupado}>
              {ocupado ? "Salvando…" : "Salvar e entrar"}
            </button>
          </>
        )}
      </form>

      <Link href="/" className="entrada-atalho">
        Ir para a tela de apontamento
      </Link>
    </main>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { listarEtapas } from "../../actions";
import { gravarEtapaConfigurada, lerEtapaConfigurada } from "@/lib/maquina";
import type { Etapa } from "@/lib/tipos";

/**
 * Configuração da máquina: escolhe qual etapa esta máquina aponta. O
 * identificador fica no localStorage, então a aplicação passa a abrir sempre
 * direto na tela dessa etapa. Dá para voltar aqui pela seta da tela do operador.
 */
export default function TelaConfiguracao() {
  const router = useRouter();
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [atual, setAtual] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  useEffect(() => {
    setAtual(lerEtapaConfigurada());
    listarEtapas(true)
      .then(setEtapas)
      .catch((e: Error) => setErro(e.message))
      .finally(() => setCarregando(false));
  }, []);

  function escolher(id: string) {
    gravarEtapaConfigurada(id);
    router.replace("/");
  }

  return (
    <main className="operador">
      <header className="op-cabecalho">
        <div className="op-cabecalho-esq">
          {atual && (
            <Link href="/" className="op-voltar" title="Voltar para o apontamento">
              ←
            </Link>
          )}
          <h1 className="op-etapa">Etapa da máquina</h1>
        </div>
        <Link href="/painel" className="op-link-discreto">
          Painel
        </Link>
      </header>

      <p className="op-instrucao">
        Escolha a etapa que esta máquina vai apontar. A escolha fica gravada neste
        computador e a aplicação passa a abrir direto nela.
      </p>

      {erro && <p className="op-aviso">{erro}</p>}
      {carregando && <p className="vazio">Carregando…</p>}

      {!carregando && !erro && etapas.length === 0 && (
        <p className="op-aviso">
          Nenhuma etapa ativa cadastrada. Cadastre uma etapa no painel de gestão.
        </p>
      )}

      <div className="op-lista-etapas">
        {etapas.map((e) => (
          <button
            key={e.id}
            type="button"
            className={`op-botao ${e.id === atual ? "op-botao--iniciar" : "op-botao--retomar"}`}
            onClick={() => escolher(e.id)}
          >
            {e.nome}
            {e.id === atual ? " ✓" : ""}
          </button>
        ))}
      </div>
    </main>
  );
}

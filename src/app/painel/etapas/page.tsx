"use client";

import { useCallback, useEffect, useState } from "react";
import { listarEtapas } from "../../actions";
import GestaoEtapas from "@/components/GestaoEtapas";
import type { Etapa } from "@/lib/tipos";

export default function TelaEtapas() {
  const [etapas, setEtapas] = useState<Etapa[]>([]);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(() => {
    listarEtapas(false)
      .then(setEtapas)
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  return (
    <>
      <div className="painel-topo">
        <h1 className="painel-titulo">Etapas</h1>
        <span className="painel-legenda">
          Etapa inativa some da tela do operador e continua no histórico e nos relatórios
        </span>
      </div>

      {erro && <p className="erro">{erro}</p>}

      <GestaoEtapas etapas={etapas} aoMudar={carregar} />
    </>
  );
}

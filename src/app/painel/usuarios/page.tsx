"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Modal from "@/components/Modal";
import MenuAcoes from "./MenuAcoes";
import {
  criarUsuario,
  definirAtivoUsuario,
  definirTipoUsuario,
  excluirUsuario,
  listarUsuarios,
  meuId,
  renomearUsuario,
  resetarSenhaUsuario,
} from "../../usuarios";
import { SENHA_PADRAO } from "@/lib/regras-senha";
import type { TipoAcesso, Usuario } from "@/lib/tipos";

const ROTULO_TIPO: Record<TipoAcesso, string> = {
  GESTOR: "Gestor",
  VENDEDOR: "Vendedor",
};

/** Em que ordem a situação aparece quando se ordena por ela. */
function pesoSituacao(u: Usuario): number {
  if (!u.ativo) return 2;
  return u.primeiro_login ? 1 : 0;
}

type Coluna = "nome" | "tipo" | "situacao";

const COLUNAS: Array<{
  chave: Coluna;
  rotulo: string;
  numerica?: boolean;
  valor: (u: Usuario) => string | number;
}> = [
  { chave: "nome", rotulo: "Usuário", valor: (u) => u.nome },
  { chave: "tipo", rotulo: "Tipo de acesso", valor: (u) => ROTULO_TIPO[u.tipo] },
  { chave: "situacao", rotulo: "Situação", numerica: true, valor: pesoSituacao },
];

/** Diálogo aberto no momento, com o usuário a que ele se refere. */
type Dialogo =
  | { qual: "RENOMEAR"; usuario: Usuario }
  | { qual: "PERFIL"; usuario: Usuario }
  | { qual: "RESETAR"; usuario: Usuario }
  | { qual: "EXCLUIR"; usuario: Usuario }
  | null;

export default function TelaUsuarios() {
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [euSou, setEuSou] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoAcesso>("VENDEDOR");

  const [dialogo, setDialogo] = useState<Dialogo>(null);
  const [nomeEditado, setNomeEditado] = useState("");
  const [tipoEditado, setTipoEditado] = useState<TipoAcesso>("VENDEDOR");

  const [coluna, setColuna] = useState<Coluna>("nome");
  const [direcao, setDirecao] = useState<"asc" | "desc">("asc");

  const carregar = useCallback(() => {
    listarUsuarios()
      .then(setUsuarios)
      .catch((e: Error) => setErro(e.message));
  }, []);

  useEffect(() => {
    carregar();
    meuId().then(setEuSou).catch(() => setEuSou(null));
  }, [carregar]);

  async function executar(acao: () => Promise<{ ok: boolean; erro?: string }>) {
    setOcupado(true);
    setErro(null);
    setAviso(null);
    try {
      const r = await acao();
      if (!r.ok) {
        setErro(r.erro ?? "Não foi possível concluir a ação.");
        return false;
      }
      carregar();
      return true;
    } catch (e) {
      setErro((e as Error).message);
      return false;
    } finally {
      setOcupado(false);
    }
  }

  async function adicionar() {
    if (!nome.trim()) return;
    if (await executar(() => criarUsuario(nome, tipo))) {
      setAviso(`Usuário criado. A senha é ${SENHA_PADRAO}, e ele terá de trocá-la ao entrar.`);
      setNome("");
    }
  }

  // Mesma ordenação do histórico: clicar no cabeçalho ordena, clicar de novo
  // inverte, e o empate cai no nome para a lista não dançar.
  const visiveis = useMemo(() => {
    const definicao = COLUNAS.find((c) => c.chave === coluna)!;
    const sinal = direcao === "asc" ? 1 : -1;

    return [...usuarios].sort((a, b) => {
      const va = definicao.valor(a);
      const vb = definicao.valor(b);
      const comparacao = definicao.numerica
        ? (va as number) - (vb as number)
        : String(va).localeCompare(String(vb), "pt-BR", { numeric: true, sensitivity: "base" });

      return comparacao !== 0
        ? comparacao * sinal
        : a.nome.localeCompare(b.nome, "pt-BR", { sensitivity: "base" });
    });
  }, [usuarios, coluna, direcao]);

  function ordenarPor(nova: Coluna) {
    if (nova === coluna) setDirecao((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setColuna(nova);
      setDirecao("asc");
    }
  }

  async function confirmarPerfil(u: Usuario) {
    if (await executar(() => definirTipoUsuario(u.id, tipoEditado))) setDialogo(null);
  }

  async function confirmarRenomear(u: Usuario) {
    if (await executar(() => renomearUsuario(u.id, nomeEditado))) setDialogo(null);
  }

  async function confirmarResetar(u: Usuario) {
    if (await executar(() => resetarSenhaUsuario(u.id))) {
      setAviso(`Senha de ${u.nome} voltou a ser ${SENHA_PADRAO}. Ele vai trocá-la ao entrar.`);
      setDialogo(null);
    }
  }

  async function confirmarExcluir(u: Usuario) {
    if (await executar(() => excluirUsuario(u.id))) setDialogo(null);
  }

  return (
    <>
      <div className="painel-topo">
        <h1 className="painel-titulo">Usuários</h1>
        <span className="painel-legenda">
          Gestor: faz tudo | Vendedor: consulta OS
        </span>
      </div>

      {/* ---- cadastro ---- */}
      <section className="cartao">
        <form
          className="novo-usuario"
          onSubmit={(e) => {
            e.preventDefault();
            adicionar();
          }}
        >
          <div className="novo-usuario-campo">
            <label className="campo-rotulo" htmlFor="usuario-nome">
              Nome de usuário
            </label>
            <input
              id="usuario-nome"
              className="campo"
              type="text"
              autoComplete="off"
              placeholder="Como ele vai entrar no sistema"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>

          <div className="novo-usuario-campo novo-usuario-campo--estreito">
            <label className="campo-rotulo" htmlFor="usuario-tipo">
              Tipo de acesso
            </label>
            <select
              id="usuario-tipo"
              className="campo"
              value={tipo}
              onChange={(e) => setTipo(e.target.value as TipoAcesso)}
            >
              <option value="VENDEDOR">Vendedor</option>
              <option value="GESTOR">Gestor</option>
            </select>
          </div>

          <button type="submit" className="botao" disabled={ocupado || !nome.trim()}>
            Criar
          </button>
        </form>

        {erro && <p className="erro">{erro}</p>}
        {aviso && <p className="aviso-suave">{aviso}</p>}
      </section>

      {/* ---- tabela ---- */}
      <section className="cartao" style={{ marginTop: 16 }}>
        {usuarios.length === 0 ? (
          <p className="vazio">Nenhum usuário cadastrado.</p>
        ) : (
          <div className="tabela-rolagem">
            <table className="tabela">
              <thead>
                <tr>
                  {COLUNAS.map((c) => {
                    const ativa = c.chave === coluna;
                    return (
                      <th
                        key={c.chave}
                        aria-sort={ativa ? (direcao === "asc" ? "ascending" : "descending") : "none"}
                      >
                        <button
                          type="button"
                          className={`ordenar ${ativa ? "ordenar--ativa" : ""}`}
                          onClick={() => ordenarPor(c.chave)}
                          title={`Ordenar por ${c.rotulo}`}
                        >
                          {c.rotulo}
                          <span className="ordenar-seta" aria-hidden="true">
                            {ativa ? (direcao === "asc" ? "↓" : "↑") : "↕"}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                  <th className="coluna-acoes">
                    <span className="cabecalho-simples">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visiveis.map((u) => (
                  <tr key={u.id}>
                    <td>
                      {u.nome}
                      {u.id === euSou && <span className="marca-voce">(você)</span>}
                    </td>
                    <td>{ROTULO_TIPO[u.tipo]}</td>
                    <td>
                      {!u.ativo ? (
                        <span className="etiqueta etiqueta--inativa">Inativo</span>
                      ) : u.primeiro_login ? (
                        <span className="etiqueta etiqueta--pendente">Senha provisória</span>
                      ) : (
                        "Ativo"
                      )}
                    </td>
                    <td className="coluna-acoes">
                      <MenuAcoes
                        rotulo={u.nome}
                        acoes={[
                          {
                            rotulo: u.ativo ? "Inativar" : "Reativar",
                            icone: "desligar",
                            impedida:
                              u.ativo && u.id === euSou
                                ? "Você não pode inativar o seu próprio usuário"
                                : undefined,
                            aoEscolher: () => executar(() => definirAtivoUsuario(u.id, !u.ativo)),
                          },
                          {
                            rotulo: "Editar nome",
                            icone: "lapis",
                            aoEscolher: () => {
                              setNomeEditado(u.nome);
                              setDialogo({ qual: "RENOMEAR", usuario: u });
                            },
                          },
                          {
                            rotulo: "Perfil de acesso",
                            icone: "cracha",
                            impedida:
                              u.id === euSou
                                ? "Você não pode mudar o seu próprio perfil"
                                : undefined,
                            aoEscolher: () => {
                              setTipoEditado(u.tipo);
                              setDialogo({ qual: "PERFIL", usuario: u });
                            },
                          },
                          {
                            rotulo: "Resetar senha",
                            icone: "chave",
                            aoEscolher: () => setDialogo({ qual: "RESETAR", usuario: u }),
                          },
                          {
                            rotulo: "Excluir",
                            icone: "lixeira",
                            perigo: true,
                            impedida:
                              u.id === euSou
                                ? "Você não pode excluir o seu próprio usuário"
                                : undefined,
                            aoEscolher: () => setDialogo({ qual: "EXCLUIR", usuario: u }),
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* ---- diálogos ---- */}
      {dialogo?.qual === "RENOMEAR" && (
        <Modal titulo="Editar nome do usuário" aoFechar={() => setDialogo(null)}>
          <input
            className="campo"
            type="text"
            autoFocus
            value={nomeEditado}
            onChange={(e) => setNomeEditado(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") confirmarRenomear(dialogo.usuario);
            }}
          />
          {erro && <p className="erro">{erro}</p>}
          <div className="modal-acoes">
            <button
              type="button"
              className="botao botao--neutro"
              onClick={() => setDialogo(null)}
              disabled={ocupado}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao"
              onClick={() => confirmarRenomear(dialogo.usuario)}
              disabled={ocupado || !nomeEditado.trim()}
            >
              Salvar
            </button>
          </div>
        </Modal>
      )}

      {dialogo?.qual === "PERFIL" && (
        <Modal
          titulo={`Perfil de acesso de ${dialogo.usuario.nome}`}
          aoFechar={() => setDialogo(null)}
        >
          <label className="campo-rotulo" htmlFor="perfil-tipo">
            Tipo de acesso
          </label>
          <select
            id="perfil-tipo"
            className="campo"
            autoFocus
            value={tipoEditado}
            onChange={(e) => setTipoEditado(e.target.value as TipoAcesso)}
          >
            <option value="VENDEDOR">Vendedor — consulta OS</option>
            <option value="GESTOR">Gestor — faz tudo</option>
          </select>

          {erro && <p className="erro">{erro}</p>}

          <div className="modal-acoes">
            <button
              type="button"
              className="botao botao--neutro"
              onClick={() => setDialogo(null)}
              disabled={ocupado}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao"
              onClick={() => confirmarPerfil(dialogo.usuario)}
              disabled={ocupado || tipoEditado === dialogo.usuario.tipo}
            >
              Salvar
            </button>
          </div>
        </Modal>
      )}

      {dialogo?.qual === "RESETAR" && (
        <Modal
          titulo={`Resetar a senha de ${dialogo.usuario.nome}?`}
          aoFechar={() => setDialogo(null)}
        >
          <p className="modal-texto">
            A senha volta a ser <strong>{SENHA_PADRAO}</strong> e ele terá de escolher uma nova no
            próximo login.
          </p>
          {erro && <p className="erro">{erro}</p>}
          <div className="modal-acoes">
            <button
              type="button"
              className="botao botao--neutro"
              onClick={() => setDialogo(null)}
              disabled={ocupado}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao"
              onClick={() => confirmarResetar(dialogo.usuario)}
              disabled={ocupado}
            >
              Resetar
            </button>
          </div>
        </Modal>
      )}

      {dialogo?.qual === "EXCLUIR" && (
        <Modal
          titulo={`Excluir o usuário ${dialogo.usuario.nome}?`}
          aoFechar={() => setDialogo(null)}
        >
          <p className="modal-texto">
            Ele perde o acesso imediatamente e não dá para desfazer. Se for só afastamento
            temporário, prefira inativar.
          </p>
          {erro && <p className="erro">{erro}</p>}
          <div className="modal-acoes">
            <button
              type="button"
              className="botao botao--neutro"
              onClick={() => setDialogo(null)}
              disabled={ocupado}
            >
              Cancelar
            </button>
            <button
              type="button"
              className="botao botao--perigo"
              onClick={() => confirmarExcluir(dialogo.usuario)}
              disabled={ocupado}
            >
              Excluir
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}

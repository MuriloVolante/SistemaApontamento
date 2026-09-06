# Sistema de Apontamento Gráfico

Apontamento de tempo de operação e parada por etapa de produção. Duas telas:
a **tela do operador** (uma etapa por máquina) e o **painel de gestão**.

Sem login, sem identificação de operador. O registro é **Etapa + OS + Tipo + horários**.

---

## Como rodar

**Dê dois cliques em `iniciar.bat`.** É só isso.

Ele instala o que faltar (só na primeira vez), sobe o sistema e abre o navegador
em `http://localhost:3000`. Para encerrar, feche a janela preta ou tecle `Ctrl+C`.

Se preferir o terminal:

```bash
npm install
npm run dev
```

Não há nada para configurar: **nenhuma conta, nenhum servidor, nenhuma variável
de ambiente**. O banco é um arquivo SQLite criado sozinho em
`dados/apontamento.db` na primeira execução, já com três etapas de exemplo
(Impressão, Corte, Acabamento) para você ter o que apontar.

### O que esperar na primeira vez

1. Como nenhuma máquina foi configurada ainda, a aplicação abre em `/configurar` —
   toque na etapa desta máquina.
2. A partir daí `http://localhost:3000` já cai direto na tela dessa etapa.
3. Para trocar a etapa depois, use a seta **←** no canto superior esquerdo da
   tela do operador.
4. O painel fica em `http://localhost:3000/painel`, ou pelo botão **Painel** no
   canto superior direito.
5. Para simular outra máquina, use uma janela anônima (o `localStorage` é separado).

### Mexer no banco

O arquivo `dados/apontamento.db` é um SQLite comum — abre no
[DB Browser for SQLite](https://sqlitebrowser.org/) se você quiser espiar os
dados. Para **zerar tudo**, feche o sistema e apague a pasta `dados/`; ela é
recriada e semeada na próxima execução.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 14 (App Router) + TypeScript |
| Banco (local) | SQLite em arquivo, via `better-sqlite3` |
| Banco (nuvem, opcional) | Supabase / Postgres |
| Relatórios | jsPDF + jspdf-autotable |

Leituras e gravações passam por **server actions**, então todos os timestamps
vêm do relógio do servidor — o cronômetro nunca depende do relógio do navegador
do operador.

A camada de dados é uma interface só (`src/lib/repositorio.ts`) com duas
implementações que gravam o mesmo esquema. A escolha é automática:

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` **vazias** → SQLite local (padrão);
- as duas **preenchidas** → Supabase.

Ou seja: rodar local não exige decisão nenhuma, e migrar para a nuvem depois é
só preencher duas variáveis — sem tocar em uma linha das telas.

---

## Fluxo do apontamento

```
Parado ──Iniciar(OS)──▶ Em andamento ──Parar(motivo)──▶ Pausado
                            ▲                              │
                            └──────────Retomar─────────────┘
                            │                              │
                            └──────Finalizar(confirma)─────┴──▶ Parado
```

- **Iniciar** exige OS preenchida, grava o início e trava o campo OS.
- **Parar** exige motivo preenchido: fecha o segmento como `OPERACAO` e abre um de `PAUSA`.
- **Retomar** fecha o segmento de `PAUSA` gravando a justificativa e abre novo `OPERACAO`.
- **Finalizar** pede confirmação, fecha o segmento em aberto e libera a etapa para a próxima OS.

O fim de um segmento é exatamente o início do seguinte, sem lacuna, e todos os
instantes são truncados ao segundo — a soma das durações fecha com o tempo total
do ciclo.

Fechar o navegador não perde nada: o apontamento em curso fica na tabela
`sessoes` e o cronômetro é sempre recalculado por diferença de timestamps a
partir de `segmento_inicio`. O `localStorage` guarda apenas qual etapa esta
máquina aponta — nunca estado nem tempo decorrido.

### Habilitação dos controles

| Controle | Parado | Em andamento | Pausado |
|---|---|---|---|
| Campo OS | habilitado | bloqueado | bloqueado |
| Iniciar | habilitado | desabilitado | desabilitado |
| Motivo parada | desabilitado | habilitado | bloqueado |
| Parar | desabilitado | só com motivo preenchido | desabilitado |
| Retomar | desabilitado | desabilitado | habilitado |
| Finalizar | desabilitado | habilitado | habilitado |

---

## Painel de gestão

- **Filtros:** OS (busca parcial), Etapa, Tipo e Data. A data é interpretada no
  fuso do navegador, então "hoje" é o dia local de quem consulta.
- **Cards:** Tempo Total, Tempo em Operação e Tempo em Pausa, em `HH:MM:SS`,
  recalculados a cada mudança de filtro — vêm da mesma consulta que alimenta a tabela.
- **Tabela:** 50 registros por página, com navegação no rodapé. Os cards e os
  relatórios continuam considerando o filtro inteiro, não apenas a página aberta.
- **Relatório Analítico:** espelho da tabela filtrada, com os três totais no cabeçalho.
- **Relatório Sintético:** modal com Data Início, Data Fim, OS e Etapa; gera, por
  etapa, tempo total, tempo em operação e tempo pausado, com linha de total
  consolidado.
- **Gestão de etapas** (rodapé): listar, adicionar, renomear, inativar e reativar.
  Etapa com apontamentos vinculados não pode ser excluída, apenas inativada.
  Etapa inativa some da tela do operador e continua nos filtros e relatórios.

---

## Rotas

| Rota | Tela |
|---|---|
| `/` | Tela do operador, já na etapa configurada nesta máquina. |
| `/configurar` | Escolha da etapa da máquina. Usada uma vez por terminal. |
| `/painel` | Painel de gestão. |

---

## Publicar na nuvem (só quando quiser)

O sistema roda 100% local sem isso. Se um dia precisar que várias máquinas do
chão de fábrica compartilhem o mesmo banco:

1. Crie um projeto no [Supabase](https://supabase.com) e rode
   [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor.
2. Copie `.env.local.example` para `.env.local` e preencha `NEXT_PUBLIC_SUPABASE_URL`
   e `NEXT_PUBLIC_SUPABASE_ANON_KEY` (Project Settings → API).
3. Reinicie o sistema. Ele passa a gravar no Supabase automaticamente.
4. Para hospedar: importe o repositório na Vercel e cadastre as mesmas duas
   variáveis em Settings → Environment Variables.

Os dados do SQLite local **não** são migrados automaticamente.

---

## Estrutura

```
iniciar.bat             duplo clique para subir o sistema
dados/apontamento.db    banco local (criado sozinho, fora do versionamento)
src/
  app/
    actions.ts          server actions: etapas e ciclo do apontamento
    consultas.ts        server actions: consultas e totais do painel
    page.tsx            tela do operador
    configurar/         escolha da etapa da máquina
    painel/             painel de gestão
    globals.css         estilos (operador com alvos grandes de toque)
  components/
    GestaoEtapas.tsx    listar / adicionar / renomear / inativar
    ModalSintetico.tsx  parâmetros do relatório sintético
  lib/
    repositorio.ts      interface da camada de dados + escolha do backend
    repo-sqlite.ts      implementação local (padrão)
    repo-supabase.ts    implementação em nuvem (opcional)
    tempo.ts            HH:MM:SS, diferenças e limites de data
    pdf.ts              relatórios analítico e sintético
    maquina.ts          etapa configurada no localStorage
    tipos.ts            tipos compartilhados
supabase/
  schema.sql            DDL para o Postgres, usado só no cenário de nuvem
```

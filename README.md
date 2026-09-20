# Sistema de Apontamento Gráfico

Apontamento de tempo de operação e parada por etapa de produção. Duas telas:
a **tela do operador** (uma etapa por máquina) e o **painel de gestão**.

Sem login, sem identificação de operador. O registro é **Etapa + OS + Tipo + horários**.

---

## Como rodar

**Dê dois cliques em `iniciar.bat`.** É só isso.

Ele instala o que faltar, compila o sistema **em modo de produção** e abre o
navegador em `http://localhost:3000`. Para encerrar, feche a janela preta ou
tecle `Ctrl+C`.

A compilação só acontece quando algum arquivo mudou desde a última vez, então a
partida do dia a dia é imediata. Rodar em produção (e não em desenvolvimento) é
o que deixa a navegação instantânea: as telas já vão compiladas e minificadas,
em vez de serem montadas na primeira visita.

Para mexer no código, use `desenvolver.bat`, que recarrega sozinho a cada
alteração. É mais lento para navegar — é o preço do recarregamento automático.

Pelo terminal:

```bash
npm install
npm run iniciar
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
   canto superior direito. Ele tem quatro telas na barra de navegação.
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
| Tempo real | Server-Sent Events (nativo, sem biblioteca) |

Leituras e gravações passam por **server actions**, então todos os timestamps
vêm do relógio do servidor — o cronômetro nunca depende do relógio do navegador
do operador.

A camada de dados é uma interface só (`src/lib/repositorio.ts`) com duas
implementações que gravam o mesmo esquema. A escolha é automática:

- `NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY` **vazias** → SQLite local (padrão);
- as duas **preenchidas** → Supabase.

Ou seja: rodar local não exige decisão nenhuma, e migrar para a nuvem depois é
só preencher duas variáveis — sem tocar em uma linha das telas.

### Dimensionamento

O sistema foi ajustado para o uso real: **até 18 computadores conectados** e
**até 15 etapas** ao mesmo tempo.

O ponto que mais importa nessa conta é o tempo real. Existe **um único** relógio
no servidor lendo o banco uma vez por segundo, não um por navegador conectado —
as 18 telas assinam esse mesmo relógio. E o pacote só é enviado quando o estado
muda de verdade: com a fábrica parada, o tráfego é zero. Uma leitura envolve
duas consultas sobre tabelas minúsculas (no máximo uma sessão por etapa, ou seja
15 linhas), o que é irrelevante para o SQLite.

Os cards de totais do dashboard só são reconsultados quando algum apontamento é
gravado, detectado por um número de revisão que vem junto no pacote.

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

Quatro telas, em uma barra de navegação no topo.

### Dashboard

O que está acontecendo agora, sem nenhum filtro para preencher:

- os três cards — Tempo Total, Tempo em Operação e Tempo em Pausa — com os
  totais **do dia de hoje**;
- um card por **OS em andamento**, com o número da OS, a etapa, o cronômetro do
  estado atual e, quando pausada, o motivo da parada.

O dashboard é **ao vivo**: não precisa atualizar a página. O servidor mantém um
fluxo aberto (SSE, em `/api/ativos`) e empurra cada mudança em até um segundo —
uma OS que começa, uma parada, uma retomada, um apontamento finalizado. O ponto
verde ao lado do título indica que o canal está aberto; se cair, ele reconecta
sozinho e, enquanto isso, a tela volta a consultar a cada 15 segundos para não
ficar parada.

Os cronômetros são recalculados por diferença de timestamps contra o relógio do
servidor, igual à tela do operador.

### Histórico

A tabela completa de apontamentos, com filtros de OS (busca parcial), Etapa,
Tipo e Data, os três cards recalculados a cada mudança de filtro, e paginação de
50 registros.

**Toda coluna ordena.** Clique no cabeçalho para ordenar por ele em ordem
crescente, clique de novo para inverter. A seta mostra o sentido em que os
valores crescem ao descer a lista: **↓ crescente**, **↑ decrescente**. A tabela
abre ordenada por `#` crescente, que é a ordem cronológica. Cada coluna ordena
pelo que a célula mostra — `Data` pela data, `Hora Início` e `Hora Fim` pela
hora do dia, `Tempo Total` pela duração — e empates mantêm a ordem cronológica.

O botão **Exportar esta consulta** gera o relatório analítico exatamente com o
que está filtrado, na mesma ordem que está na tela.

A data é interpretada no fuso do navegador, então "hoje" é o dia local de quem
consulta.

### Etapas

Listar, adicionar, renomear, inativar e reativar. Etapa com apontamentos
vinculados não pode ser excluída, apenas inativada. Etapa inativa some da tela do
operador e continua no histórico e nos relatórios.

### Relatórios

Um formulário de parâmetros — Data Início, Data Fim, OS e Etapa — que vale para
os dois relatórios:

- **Analítico:** um apontamento por linha, com os três totais no cabeçalho.
- **Sintético:** uma linha por etapa com tempo total, tempo em operação e tempo
  pausado, fechando com o total consolidado.

---

## Rotas

| Rota | Tela |
|---|---|
| `/` | Tela do operador, já na etapa configurada nesta máquina. |
| `/configurar` | Escolha da etapa da máquina. Usada uma vez por terminal. |
| `/painel` | Dashboard: totais do dia e OSs em andamento. |
| `/painel/historico` | Tabela completa, com filtros e paginação. |
| `/painel/etapas` | Cadastro de etapas. |
| `/painel/relatorios` | Geração dos dois relatórios em PDF. |

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
iniciar.bat             duplo clique para subir o sistema (producao)
desenvolver.bat         modo de desenvolvimento, para editar o codigo
scripts/preparar.mjs    compila so quando algum arquivo mudou
dados/apontamento.db    banco local (criado sozinho, fora do versionamento)
src/
  app/
    api/ativos/         fluxo SSE que alimenta o dashboard ao vivo
    actions.ts          server actions: etapas e ciclo do apontamento
    consultas.ts        server actions: consultas e totais do painel
    page.tsx            tela do operador
    configurar/         escolha da etapa da máquina
    painel/
      layout.tsx        barra de navegação do painel
      page.tsx          Dashboard
      Totais.tsx        os três cards, usados por Dashboard e Histórico
      historico/        tabela com filtros e paginação
      etapas/           cadastro de etapas
      relatorios/       parâmetros e geração dos PDFs
    globals.css         estilos (operador com alvos grandes de toque)
  components/
    GestaoEtapas.tsx    listar / adicionar / renomear / inativar
  lib/
    repositorio.ts      interface da camada de dados + escolha do backend
    transmissor.ts      relógio único que difunde mudanças para as telas
    repo-sqlite.ts      implementação local (padrão)
    repo-supabase.ts    implementação em nuvem (opcional)
    tempo.ts            HH:MM:SS, diferenças e limites de data
    pdf.ts              relatórios analítico e sintético
    maquina.ts          etapa configurada no localStorage
    tipos.ts            tipos compartilhados
supabase/
  schema.sql            DDL para o Postgres, usado só no cenário de nuvem
```

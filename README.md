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

Os dois modos gravam em pastas separadas (`.next` para produção, `.next-dev`
para desenvolvimento). Isso não é detalhe: quando dividiam a mesma pasta, rodar
o modo de desenvolvimento sobrescrevia pedaços do build de produção e o
`iniciar.bat` seguinte falhava com `Cannot find module './XXX.js'`.

Se por qualquer motivo o sistema não subir, apague a pasta `.next` e rode o
`iniciar.bat` de novo — ele recompila do zero. Nenhum dado se perde: o banco
fica em `dados/`.

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
| Tipografia | IBM Plex Sans e Mono, hospedadas no próprio projeto |

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

## Sistema visual

Paleta neutra fria com **um único acento** em azul-petróleo. Cor forte é
reservada para significado, nunca para decorar: verde é operação, âmbar é
pausa, vinho é parada. Um cartão de OS ou o estado do operador se lê de longe
pela faixa de cor antes mesmo de ler a palavra.

**Tipografia.** IBM Plex Sans, com **algarismos tabulares** em tudo que é
número. Os dígitos ficam com a mesma largura, então o cronômetro não "dança" a
cada segundo, e o zero é limpo, sem ponto no meio. A fonte fica em
`src/fontes`, dentro do repositório: a aplicação roda no chão de fábrica e
precisa funcionar sem internet, no navegador e na hora de compilar. São 45 kB,
só o subconjunto latino.

**Durações** aparecem como `00h 00m 00s`; horas de início e fim seguem no
formato de relógio.

**Ícones** no traço do Iconoir (MIT), embutidos como SVG num componente local:
sem dependência, sem CDN e sem peso perceptível no pacote.

**Escala fluida.** Espaçamentos e tamanhos de texto usam `clamp()`, então a
interface acompanha de um celular a um monitor grande sem quebras e sem
pontos de virada bruscos. No celular a tela do operador vira uma coluna só e o
cronômetro sobe para o topo, que é o que o operador confere primeiro; as abas
do painel rolam na horizontal e a tabela rola dentro da própria moldura.

**Movimento.** Curto e discreto — 110 ms a 300 ms, sempre com saída suave.
Entrada de tela ao trocar de página, modal que cresce do centro, elevação leve
no hover, afundamento no clique, e um cartão que surge quando uma OS nova
começa (os que já estão na tela não piscam a cada atualização). Quem tiver
"reduzir movimento" ligado no sistema recebe tudo estático.

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

Uma **busca de OS** no topo, para quando o cliente liga perguntando do
material: digita-se o número exato e a tela mostra em que etapa a OS está, se
está em andamento ou pausada e há quanto tempo — ou avisa que ela não está em
operação, indicando a última etapa por onde passou. Abaixo, os totais e todo o
histórico daquela OS. O cartão de situação é alimentado pelo fluxo ao vivo,
então o cronômetro dele corre sozinho.

Sem busca ativa, o dashboard mostra o que está acontecendo agora:

- os três cards — Tempo Total, Tempo em Operação e Tempo em Pausa — com os
  totais **do dia de hoje**;
- um card por **OS em andamento**, com o número da OS, a etapa, o cronômetro
  do estado atual e, quando pausada, o motivo da parada.

O dashboard é **ao vivo**: não precisa atualizar a página. O servidor mantém um
fluxo aberto (SSE, em `/api/ativos`) e empurra cada mudança em até um segundo.
Se o canal cair, o EventSource reconecta sozinho e, enquanto isso, a tela volta
a consultar a cada 15 segundos, avisando de forma discreta enquanto dura.

Os cronômetros são recalculados por diferença de timestamps contra o relógio do
servidor, igual à tela do operador.

### Histórico

A tabela completa de apontamentos. Os filtros ficam numa **lateral fixa** que
acompanha a rolagem — OS (busca parcial), Etapa e Data. Abaixo de 1080 px ela
vira um painel recolhível no topo, com a contagem de filtros ativos.

A coluna **`#` é o identificador do registro**: um sequencial por ordem de
criação, gravado no banco. Ele fica preso à linha, então filtrando por Pausa a
tabela mostra `#2`, `#4`, `#6` — e não `1`, `2`, `3`.

**Toda coluna ordena.** Clique no cabeçalho para ordenar em ordem crescente,
clique de novo para inverter. A seta mostra o sentido em que os valores crescem
ao descer a lista: **↓ crescente**, **↑ decrescente**. Cada coluna ordena pelo
que a célula mostra, e empates mantêm a ordem de criação. A paginação é de 50
registros.

**Os três cards são o filtro por tipo.** Clicar em "Tempo em Operação" recorta
a tabela para Operação e acende o card; clicar de novo desfaz. Por isso não
existe um campo "Tipo" nos filtros — seria a mesma coisa duas vezes. Os totais
continuam calculados sobre a consulta inteira, senão o card clicado zeraria os
outros dois.

#### No celular

Abaixo de 760 px a tabela deixa de caber e o histórico troca de forma — não
por CSS, mas trocando a árvore: só uma das duas existe no DOM.

A tabela é um log de eventos, boa para auditoria e ruim para decidir. No
celular ela desce um nível e o que aparece é **um card por OS, etapa e dia**,
não por evento:

- os três números numa linha só, com a fatia de ociosidade em percentual;
- uma barra de operação contra pausa no lugar das colunas Tipo, Início, Fim e
  Tempo;
- as justificativas de parada somadas no card — "banheiro (3× · 45s)";
- tocar no card abre a linha do tempo, com os horários evento a evento.

A ordenação padrão é por maior tempo, com um atalho para maior percentual
parado — nunca pelo `#`, que numa tela pequena não diz nada. Os filtros viram
chips no topo e abrem num painel que sobe do rodapé; o relatório vira botão
flutuante.

**Gerar relatório** abre um modal já preenchido com OS, Etapa e Tipo da tela;
ali se informa Data Início e Data Fim e escolhe-se entre:

- **Analítico:** um apontamento por linha, com os três totais no cabeçalho.
- **Sintético:** uma linha por etapa com tempo total, em operação e pausado,
  fechando com o total consolidado.

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
| `/painel` | Dashboard: busca de OS, totais do dia e OSs em andamento. |
| `/painel/historico` | Tabela completa, com filtros, ordenação e relatórios. |
| `/painel/etapas` | Cadastro de etapas. |

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
scripts/preparar.mjs    compila so quando o codigo mudou, e valida o build
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
      BuscaOs.tsx       busca de OS do dashboard
      historico/        tabela, filtros laterais e modal de relatório
        CartoesOs.tsx   histórico em cards, para telas estreitas
      etapas/           cadastro de etapas
    globals.css         estilos (operador com alvos grandes de toque)
  components/
    GestaoEtapas.tsx    listar / adicionar / renomear / inativar
    Modal.tsx           modal renderizado por portal no body
    Icone.tsx           icones no traco do Iconoir, embutidos
  fontes/               IBM Plex Sans e Mono (.woff2), para rodar sem internet
  lib/
    repositorio.ts      interface da camada de dados + escolha do backend
    transmissor.ts      relógio único que difunde mudanças para as telas
    repo-sqlite.ts      implementação local (padrão)
    repo-supabase.ts    implementação em nuvem (opcional)
    agrupar.ts          junta eventos em blocos de OS + etapa + dia
    tempo.ts            HH:MM:SS, diferenças e limites de data
    pdf.ts              relatórios analítico e sintético
    maquina.ts          etapa configurada no localStorage
    tipos.ts            tipos compartilhados
supabase/
  schema.sql            DDL para o Postgres, usado só no cenário de nuvem
```

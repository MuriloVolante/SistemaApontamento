# Sistema de Apontamento Gráfico

Apontamento de tempo de operação e parada por etapa de produção. Duas partes:
a **tela do operador** (uma etapa por máquina, sem login) e o **painel de
gestão** (com login, para gestores e vendedores).

O registro é **Etapa + OS + Tipo + horários**, sem identificação de operador.

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
alteração. É mais lento para navegar, é o preço do recarregamento automático.

Os dois modos gravam em pastas separadas (`.next` para produção, `.next-dev`
para desenvolvimento). Isso não é detalhe: quando dividiam a mesma pasta, rodar
o modo de desenvolvimento sobrescrevia pedaços do build de produção e o
`iniciar.bat` seguinte falhava com `Cannot find module './XXX.js'`.

Se por qualquer motivo o sistema não subir, apague a pasta `.next` e rode o
`iniciar.bat` de novo, que recompila do zero. Nenhum dado se perde: o banco
fica em `dados/`.

Pelo terminal (Node 20 ou mais novo):

```bash
npm install
npm run iniciar
```

Não há nada para configurar: **nenhuma conta, nenhum servidor, nenhuma variável
de ambiente**. O banco é um arquivo SQLite criado sozinho em
`dados/apontamento.db` na primeira execução, já com as 30 etapas da gráfica
cadastradas.

### O que esperar na primeira vez

1. Como nenhuma máquina foi configurada ainda, a aplicação abre em `/configurar`:
   toque na máquina ou no setor deste computador.
2. A partir daí `http://localhost:3000` já cai direto na tela dessa etapa.
3. Para trocar a etapa depois, use a seta **←** no canto superior esquerdo da
   tela do operador.
4. O painel fica em `http://localhost:3000/painel`, ou pelo botão **Painel** no
   canto superior direito. Ele pede login; veja [Primeiro acesso](#primeiro-acesso).
5. Para simular outra máquina, use uma janela anônima (o `localStorage` é separado).

### Depois de atualizar o sistema

O navegador guarda a tela que carregou. Se uma aba ficou aberta durante a
atualização, ela continua rodando o código antigo: a tela parece a mesma, mas
sem o que mudou. Depois de reiniciar o `iniciar.bat`, feche e abra a aba de cada
máquina (ou `Ctrl` + `F5`).

### Mexer no banco

O arquivo `dados/apontamento.db` é um SQLite comum, abre no
[DB Browser for SQLite](https://sqlitebrowser.org/) se você quiser espiar os
dados. Para **zerar tudo**, feche o sistema e apague a pasta `dados/`; ela é
recriada e semeada na próxima execução.

Um banco de uma versão anterior é atualizado sozinho na primeira partida:
colunas e índices novos são acrescentados sem mexer nos registros.

---

## Regras do sistema

As regras da especificação original, que o código cita pelo número. Duas foram
alteradas depois, por decisão do dono do sistema, e a alteração está anotada.

1. **Sem identificação do operador.** O registro é Etapa + OS + Tipo + horários.
2. **Todo tempo é Operação ou Pausa, sem lacuna entre segmentos.** O fim de um
   segmento é exatamente o início do seguinte.
3. **O motivo da parada é texto livre.**
4. **A OS não tem cadastro prévio;** é apenas o número digitado.
5. **O cronômetro é calculado por diferença de timestamps,** nunca por contador
   incremental.
6. **Toda duração é exibida num formato só.** Era `HH:MM:SS`; passou a
   `00h 00m 00s`, que se lê melhor de longe.
7. **Sem login na tela de apontamento.** A regra original valia para o sistema
   inteiro; passou a valer só para a tela do operador, e o painel de gestão
   ganhou login com dois perfis.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Aplicação | Next.js 15 (App Router) + React 19 + TypeScript |
| Banco (local) | SQLite em arquivo, via `better-sqlite3` |
| Banco (nuvem, opcional) | Supabase / Postgres |
| Relatórios | jsPDF + jspdf-autotable, carregados só na hora de gerar |
| Tempo real | Server-Sent Events (nativo, sem biblioteca) |
| Tipografia | IBM Plex Sans, hospedada no próprio projeto |

Leituras e gravações passam por **server actions**, então todos os timestamps
vêm do relógio do servidor, e o cronômetro nunca depende do relógio do navegador
do operador.

A camada de dados é uma interface só (`src/lib/repositorio.ts`) com duas
implementações que gravam o mesmo esquema. A escolha é automática:

- `SUPABASE_URL` e `SUPABASE_SERVICE_ROLE_KEY` **vazias** → SQLite local (padrão);
- as duas **preenchidas** → Supabase.

Ou seja: rodar local não exige decisão nenhuma, e migrar para a nuvem depois é
só preencher duas variáveis, sem tocar em uma linha das telas.

### Dimensionamento

O sistema foi ajustado para o uso real: **até 18 computadores conectados** e
**até 15 etapas** ao mesmo tempo.

O ponto que mais importa nessa conta é o tempo real. Existe **um único** relógio
no servidor lendo o banco uma vez por segundo, não um por navegador conectado:
as 18 telas assinam esse mesmo relógio. E o pacote só é enviado quando o estado
muda de verdade: com a fábrica parada, o tráfego é zero. Uma leitura são as
sessões em curso (no máximo uma por etapa) e o maior `#` gravado, que sai do
índice sem contar a tabela.

Os cards de totais do dashboard só são reconsultados quando algum apontamento é
gravado, percebido pela mudança desse maior `#`.

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
pontos de virada bruscos. As abas do painel rolam na horizontal e a tabela rola
dentro da própria moldura.

**Movimento.** Curto e discreto, de 110 ms a 300 ms, sempre com saída suave.
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

- **Iniciar** exige OS preenchida e grava o início.
- **Parar** exige motivo preenchido: fecha o segmento como `OPERACAO` e abre um de `PAUSA`.
- **Retomar** fecha o segmento de `PAUSA` gravando a justificativa e abre novo `OPERACAO`.
- **Finalizar** pede confirmação, fecha o segmento em aberto e libera a etapa para a próxima OS.

Fechar um segmento e abrir o seguinte é **uma escrita só**, numa transação com
a sessão travada: um duplo clique ou uma queda de rede no meio não gravam o
segmento duas vezes nem deixam a sessão pela metade. O fim de um segmento é
exatamente o início do seguinte, todos os instantes são truncados ao segundo, e
a soma das durações fecha com o tempo total do ciclo.

Fechar o navegador não perde nada: o apontamento em curso fica na tabela
`sessoes` e o cronômetro é sempre recalculado por diferença de timestamps a
partir de `segmento_inicio`. O `localStorage` guarda apenas qual etapa esta
máquina aponta, nunca estado nem tempo decorrido.

### Uma etapa de cada vez

A tela do operador mostra só o que pode ser feito agora:

| Situação | O que aparece |
|---|---|
| Parado | "Digite o número da OS e clique em iniciar", o campo e o botão Iniciar |
| Em andamento | Cronômetro em bloco verde, com **Parar** e **Finalizar** |
| Pausado | Cronômetro em bloco âmbar com o motivo, e **Retomar** e **Finalizar** |

O motivo da parada é pedido num diálogo ao tocar em **Parar**, com Cancelar
e Parar, e o Parar bloqueado enquanto o motivo estiver vazio. **Finalizar**
pede confirmação em diálogo próprio.

Se a OS digitada já passou por esta etapa alguma vez, o sistema avisa antes de
iniciar ("OS 1212 já passou por esta etapa, deseja continuar?"). É só aviso:
Continuar inicia normalmente.

A aba do navegador mostra o nome da máquina, para distinguir os computadores
na barra de tarefas.

---

## Painel de gestão

Até quatro telas na barra de navegação, conforme o perfil de quem entrou.

### Dashboard

Uma **busca de OS** no topo, para quando o cliente liga perguntando do
material: digita-se o número exato e a tela mostra em que etapa a OS está, se
está em andamento ou pausada e desde quando, ou avisa que ela não está em
operação, indicando a última etapa por onde passou. Se a mesma OS estiver
rodando em duas máquinas, aparece um cartão para cada. Abaixo, os totais e todo
o histórico daquela OS.

Sem busca ativa, o dashboard mostra o que está acontecendo agora:

- os três cards, Tempo Total, Tempo em Operação e Tempo em Pausa, com os
  totais **do dia de hoje**, contando também o tempo que está correndo agora
  (uma máquina rodando desde as 7h sem parar já aparece nos totais);
- um card por **OS em andamento**, com o número da OS, a etapa, o cronômetro
  do estado atual e, quando pausada, o motivo da parada.

O dashboard é **ao vivo**: não precisa atualizar a página. O servidor mantém um
fluxo aberto (SSE, em `/api/ativos`) e empurra cada mudança em até um segundo.
Se o canal cair, o navegador reconecta sozinho e, enquanto isso, a tela consulta
a cada 15 segundos. O canto do título diz em que situação a tela está:

| Aviso | Situação |
|---|---|
| (nenhum) | Ao vivo |
| Reconectando… | O fluxo caiu e o navegador está tentando de novo |
| Atualizando a cada 15 s | O fluxo caiu várias vezes seguidas; a tela segue atualizada por consulta e tenta o fluxo de novo a cada 2 minutos |

Os totais viram o dia à meia-noite, com a tela aberta.

### Histórico

A tabela completa de apontamentos, na largura toda da tela. Os filtros (OS por
busca parcial, Etapa e Data) ficam no botão **Filtros**, ao lado de **Gerar
relatório**, e abrem numa janela suspensa que fecha ao clicar fora; o botão
mostra quantos filtros estão ativos. Sem a lateral, as dez colunas cabem
inteiras a partir de uns 1260 px de largura; abaixo disso a tabela rola dentro
da própria moldura.

A tela **abre filtrada no dia de hoje**; apagar a data mostra tudo. A busca por
OS espera você parar de digitar antes de consultar.

A coluna **`#` é o identificador do registro**: um sequencial por ordem de
criação, gravado no banco. Ele fica preso à linha, então filtrando por Pausa a
tabela mostra `#2`, `#4`, `#6`, e não `1`, `2`, `3`.

As datas aparecem em duas colunas, **Data Início** e **Data Fim**: um segmento
pode começar num dia e terminar no outro, atravessando a meia-noite. Nos totais
e nos filtros de data ele conta no dia em que começou.

**Toda coluna ordena.** Clique no cabeçalho para ordenar em ordem crescente,
clique de novo para inverter. A seta mostra o sentido em que os valores crescem
ao descer a lista: **↓ crescente**, **↑ decrescente**. Cada coluna ordena pelo
que a célula mostra, e empates mantêm a ordem de criação. A paginação é de 50
registros.

**Os três cards são o filtro por tipo.** Clicar em "Tempo em Operação" recorta
a tabela para Operação e acende o card; clicar de novo desfaz. Por isso não
existe um campo "Tipo" nos filtros, seria a mesma coisa duas vezes. Os totais
continuam calculados sobre a consulta inteira, senão o card clicado zeraria os
outros dois.

**Gerar relatório** abre um diálogo já preenchido com os filtros da tela (OS,
Etapa, Tipo e a data, que vira o período). Todos continuam editáveis ali. O
diálogo recusa período com início depois do fim. Os dois relatórios:

- **Analítico:** um apontamento por linha, espelho da tabela, com os três
  totais no cabeçalho.
- **Sintético:** uma linha por etapa com tempo total, em operação e pausado,
  fechando com o total consolidado.

O **ⓘ** ao lado de cada nome explica o relatório ao passar o mouse ou tocar.

#### No celular

Abaixo de 760 px a tabela deixa de caber e o histórico troca de forma, não
por CSS, mas trocando a árvore: só uma das duas existe no DOM.

A tabela é um log de eventos, boa para auditoria e ruim para decidir. No
celular ela desce um nível e o que aparece é **um card por OS, etapa e dia**,
não por evento:

- os mesmos três cards do dashboard, com o percentual de ociosidade sob o
  card de pausa;
- uma barra de operação contra pausa no lugar das colunas Tipo, Início, Fim e
  Tempo;
- as justificativas de parada somadas no card, como "banheiro (3× · 45s)";
- tocar no card abre a linha do tempo, com os horários evento a evento (e a
  data do fim, quando o segmento atravessou a meia-noite).

A ordenação padrão é por maior tempo, com um atalho para maior percentual
parado, nunca pelo `#`, que numa tela pequena não diz nada. O botão de
filtros abre um painel que sobe do rodapé, e o relatório vira botão
flutuante.

### Etapas

Listar, adicionar, renomear, inativar, reativar e excluir. Excluir pede
confirmação, e só é possível para etapa que nunca teve apontamento; as demais
só podem ser inativadas. Etapa inativa some da tela do operador e continua no
histórico e nos relatórios. Dois nomes que só diferem em maiúsculas ("Corte" e
"corte") são a mesma etapa.

As etapas cadastradas num banco novo vêm de `src/lib/etapas-iniciais.ts`, que é
a fonte única. O bloco equivalente do `supabase/schema.sql` é gerado a partir
dela com `node scripts/espelhar-etapas.mjs`.

### Usuários

Cadastro, com o nome e o perfil de acesso. A engrenagem de cada linha abre as
ações: inativar, editar nome, perfil de acesso, resetar senha e excluir. Veja
[Acesso ao painel](#acesso-ao-painel).

---

## Rotas

| Rota | Tela | Acesso |
|---|---|---|
| `/` | Tela do operador, já na etapa configurada nesta máquina. | Livre |
| `/configurar` | Escolha da etapa da máquina. Usada uma vez por terminal. | Livre |
| `/login` | Entrada do painel e troca obrigatória de senha. | Livre |
| `/painel` | Dashboard para o gestor; consulta de OS para o vendedor. | Gestor e vendedor |
| `/painel/historico` | Tabela completa, com filtros, ordenação e relatórios. | Gestor |
| `/painel/etapas` | Cadastro de etapas. | Gestor |
| `/painel/usuarios` | Cadastro de usuários. | Gestor |

---

## Acesso ao painel

A tela de apontamento **não tem login** (regra 7): ninguém vai digitar senha
para apertar Iniciar no meio do turno. O login existe só para o painel.

| Perfil | O que vê |
|---|---|
| **Gestor** | Tudo: dashboard, histórico, relatórios, etapas e usuários |
| **Vendedor** | Só a consulta de OS: onde ela está agora e por onde já passou |

A tela do vendedor é a mesma rota do dashboard, montada de outro jeito: barra
de busca, o cartão da situação da OS e as etapas por onde ela passou. Sem
totais do dia, sem cronômetro e sem a coluna de duração, porque o acesso dele é
para responder ao cliente que ligou, não para medir produção.

### Primeiro acesso

Num banco sem nenhum usuário, o sistema cria um gestor na primeira tentativa de
login:

```
usuário: gestor
senha:   senha12345
```

Ele entra já no formulário de troca de senha, e a senha padrão não sobrevive ao
primeiro uso. Depois disso, cadastre as pessoas em **Painel → Usuários**.

### Como funcionam as senhas

Todo usuário nasce com `senha12345` e com a troca obrigatória ligada; quem
entra com ela é levado direto para "Crie a sua senha", com confirmação e
**pelo menos seis caracteres**. A senha nova não pode ser a própria
`senha12345`. **Resetar senha** devolve a senha padrão e religa a troca
obrigatória, e serve para quem esqueceu a própria.

Quem já está no painel troca a própria senha clicando no seu nome, no canto da
barra de navegação. É preciso informar a senha atual.

As senhas são guardadas com `scrypt` e sal por senha, nunca em texto. Quem
abrisse o arquivo do banco não leria nenhuma.

Cinco senhas erradas seguidas no mesmo usuário bloqueiam novas tentativas por
um minuto. Usuário inexistente, senha errada e usuário inativo recebem a mesma
mensagem, e no mesmo tempo de resposta: a tela não entrega quem tem cadastro.

### Onde o acesso é conferido

Esconder uma aba não protege nada: a ação continuaria alcançável por quem
soubesse chamá-la. Então a conferência é do servidor, em três lugares: cada
ação verifica o perfil antes de devolver qualquer dado; o layout do painel
confere a sessão antes de a tela existir; e as telas só de gestor têm um layout
próprio que devolve o vendedor à consulta antes de montar a página.

Tudo é conferido **no banco**, não no cookie. O cookie guarda quem entrou e a
"versão" da sessão daquela pessoa, que muda a cada troca de senha, reset e
inativação. Por isso vale na hora:

- inativar ou excluir alguém corta o acesso na próxima ação dele;
- resetar ou trocar a senha derruba todas as sessões abertas com a senha
  antiga;
- mudar o perfil muda as abas na próxima navegação, sem sair e entrar.

Com a sessão encerrada por qualquer um desses motivos, a próxima ação leva de
volta ao login.

O cookie de sessão é assinado com uma chave sorteada na primeira execução e
guardada no banco: nada a configurar, e ninguém cai quando o servidor
reinicia. Ele não é marcado como `secure` de propósito, porque a gráfica acessa
o painel por http, no endereço da máquina na rede local, e um cookie `secure`
simplesmente nunca seria enviado.

---

## Publicar na nuvem (só quando quiser)

O sistema roda 100% local sem isso. Se um dia precisar que várias máquinas do
chão de fábrica compartilhem o mesmo banco:

1. Crie um projeto no [Supabase](https://supabase.com) e rode
   [`supabase/schema.sql`](supabase/schema.sql) no SQL Editor. O arquivo pode
   ser rodado de novo depois de uma atualização: ele acrescenta o que faltar.
2. Copie `.env.local.example` para `.env.local` e preencha `SUPABASE_URL` e
   `SUPABASE_SERVICE_ROLE_KEY` (Project Settings → API).
3. Reinicie o sistema. Ele passa a gravar no Supabase automaticamente.
4. Para hospedar: importe o repositório na Vercel e cadastre as mesmas duas
   variáveis em Settings → Environment Variables.

Os dados do SQLite local **não** são migrados automaticamente.

### Por que a chave *service_role*, e não a publicável

O login do painel é da própria aplicação, não do Supabase, e a tela do operador
não tem login (regra 7). Por isso o banco não pode ficar aberto ao papel
anônimo: a chave publicável de um projeto Supabase viaja no navegador de
qualquer visitante, e com RLS liberada ela daria leitura, escrita e exclusão
direto pela API REST, bastaria abrir o console do navegador.

Então o acesso é só pelo servidor. As variáveis não levam o prefixo
`NEXT_PUBLIC_` (que embutiria o valor no pacote do navegador), o
`schema.sql` liga RLS **sem nenhuma política** e revoga os privilégios de
`anon`, e todo o tráfego passa pelas server actions. Nenhuma linha do código do
navegador fala com o Supabase.

### Atualização ao vivo e tipo de hospedagem

O painel recebe as mudanças por um fluxo aberto (SSE) alimentado por um único
relógio no servidor. Isso pressupõe um **processo que fica de pé**: é o caso do
`iniciar.bat` num PC da gráfica, de um container ou de hospedagens como Render
e Railway.

Em hospedagem sem processo fixo, como Vercel e afins, a conexão é cortada ao
atingir o tempo máximo da função, e cada reconexão levanta uma instância nova
lendo o banco. O painel detecta isso (quatro quedas em dois minutos), desiste do
fluxo e passa a consultar a cada 15 segundos, tentando o fluxo de novo a cada
2 minutos. Continua correto e atualizado, só não é instantâneo. Se a
atualização instantânea importar, prefira uma hospedagem com processo fixo.

---

## Estrutura

```
iniciar.bat                  duplo clique para subir o sistema (produção)
desenvolver.bat              modo de desenvolvimento, para editar o código
scripts/
  preparar.mjs               compila só quando o código mudou, e valida o build
  espelhar-etapas.mjs        gera no schema.sql o bloco das etapas iniciais
dados/apontamento.db         banco local (criado sozinho, fora do versionamento)
src/
  app/
    (operador)/              telas sem login
      page.tsx               tela do operador
      configurar/            escolha da etapa da máquina
    login/                   entrada do painel e troca obrigatória de senha
    painel/
      layout.tsx             confere a sessão no servidor antes da tela
      NavPainel.tsx          barra de navegação, conforme o perfil
      ContextoUsuario.tsx    quem está logado, para as telas se montarem
      TrocarSenha.tsx        troca da própria senha
      page.tsx               Dashboard (gestor) ou consulta de OS (vendedor)
      BuscaOs.tsx            busca de OS
      Totais.tsx             os três cards, usados por Dashboard e Histórico
      (gestor)/              telas só de gestor, conferidas no servidor
        historico/           tabela, filtros, cards do celular e relatório
        etapas/              cadastro de etapas
        usuarios/            cadastro de usuários e menu de ações
    api/ativos/              fluxo SSE que alimenta o dashboard ao vivo
    actions.ts               server actions: etapas e ciclo do apontamento
    consultas.ts             server actions: consultas e totais do painel
    acesso.ts                server actions: entrar, definir e trocar senha, sair
    usuarios.ts              server actions: cadastro de usuários
    globals.css              estilos (operador com alvos grandes de toque)
  components/
    GestaoEtapas.tsx         listar, adicionar, renomear, inativar, excluir
    Modal.tsx                modal renderizado por portal no body
    Dica.tsx                 o "i" que explica sem ocupar a tela
    Transicao.tsx            troca de tela deslizante
    useTituloJanela.ts       nome da tela na aba do navegador
    Icone.tsx                ícones no traço do Iconoir, embutidos
  fontes/                    IBM Plex Sans (.woff2), para rodar sem internet
  lib/
    repositorio.ts           interface da camada de dados e escolha do banco
    repo-sqlite.ts           implementação local (padrão), com a migração
    repo-supabase.ts         implementação em nuvem (opcional)
    sessao.ts                cookie de sessão e as travas de acesso
    senha.ts                 scrypt, conferência e regras da senha nova
    regras-senha.ts          senha padrão e tamanho mínimo, também para as telas
    tentativas.ts            bloqueio de um minuto após cinco senhas erradas
    nomes.ts                 limites de tamanho e comparação de nomes
    erros.ts                 erro inesperado: console do servidor e frase útil
    etapas-iniciais.ts       as 30 etapas de um banco novo (fonte única)
    transmissor.ts           relógio único que difunde mudanças para as telas
    agrupar.ts               junta eventos em blocos de OS, etapa e dia
    tempo.ts                 durações, diferenças e limites de data
    pdf.ts                   relatórios analítico e sintético
    maquina.ts               etapa configurada no localStorage
    tipos.ts                 tipos compartilhados
supabase/
  schema.sql                 DDL para o Postgres, usado só no cenário de nuvem
```

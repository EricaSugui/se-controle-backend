# Diário de método do experimento

Registro das escolhas e dos parâmetros usados, bloco a bloco, para a
redação de Material e Métodos (no passado, com o que foi realmente feito).
O plano e as decisões de desenho ficam no workspace, em
`docs/planos/pesquisa-hashchain.md` (seções 6 e 9).

## Bloco 0: banco de medição (27/11/2026)

**O que foi feito**

- Banco de medição num contêiner Docker dedicado (`docker-compose.yml`),
  separado do Supabase local do DEV, com a imagem oficial
  `postgres:17.12` (mesma versão principal do Supabase usado pelo
  produto). Primeira execução com o id de imagem
  `sha256:97fb53376be3e4fb1a8a61421daa69dcc3bf2fa39bda3259f5245f9a455af1a9`.
- Limites do contêiner: **4 CPUs**, **4 GB de memória** e 256 MB de
  memória compartilhada. Porta `127.0.0.1:55432`. Servidor e sessão em
  UTC.
- Configurações do Postgres: as **padrão da imagem**, sem ajuste
  (por exemplo `shared_buffers` = 128 MB, `synchronous_commit` = on,
  `fsync` = on, `jit` = on). Cada rodada grava os valores efetivos no
  `ambiente.json`.
- O banco é recriado do zero antes de cada rodada
  (`npm run exp:recriar -- a|b|base`): o contêiner e o volume são
  apagados, e o schema é montado na ordem compatibilidade → migrations
  do produto (78 em 27/11/2026) → SQL do experimento.
- **Compatibilidade com o Supabase** (`sql/00-compat-supabase.sql`): 31
  migrations do produto concedem permissões ao papel `authenticated` e
  usam `auth.uid()` nas políticas de RLS. O arquivo cria só os papéis
  `anon`, `authenticated` e `service_role`, o schema `auth` e a função
  `auth.uid()`. Com isso, as migrations rodaram sem alteração num
  Postgres puro, e o plano B (imagem `supabase/postgres`) não foi
  necessário. O harness conecta como `postgres`, que não é afetado
  pelo RLS, então esses objetos não interferem na medição.
- Registro do ambiente (`npm run exp:ambiente -- <arquivo>`): data,
  commit e branch (com indicação de alterações não commitadas), CPU,
  threads e memória da máquina, sistema, versões do Node, do driver
  `pg`, do Docker e do Postgres, limites efetivos do contêiner e as
  configurações do Postgres que afetam escrita e armazenamento.

**Máquina usada (27/11/2026)**

- Intel Core i7-13620H (16 threads lógicos), 15,7 GB de RAM, Windows 11
  Home (10.0.26300), Docker Desktop 29.9.3 (backend WSL 2), Node 22.23.4.

**Tempo de recriação:** cerca de 15 segundos com a imagem já baixada.

**A lembrar nas rodadas**

- Desligar o Supabase local do DEV (`npm run supabase:stop`) e fechar
  programas pesados, para reduzir o ruído (a máquina é compartilhada
  com o contêiner pelo WSL 2).
- Não usar o `src/db.ts` do produto no verificador: ele converte
  `numeric` em `float` (bloco 1).

## Bloco 1: modelo de evento e serialização (27/11/2026)

**O que foi feito**

- Tabela `audit.eventos` (`sql/10-audit-comum.sql`), comum às duas
  condições: `id` (identidade, só técnico), `casa_id`, `indice`,
  `operacao` (`INSERT`, `UPDATE` ou `DELETE`), `entidade` (`compras`,
  `parcelas` ou `receitas`), `entidade_id`, `pessoa_responsavel_id`
  (opcional), `usuario_registrador_id`, `ocorrido_em` (`timestamptz`,
  padrão `clock_timestamp()`), `conteudo` (`jsonb` com `antes` e
  `depois`), `hash_anterior` e `hash`. FKs para `casas` e `pessoas`, CHECK
  da operação e da entidade, e `(casa_id, indice)` único.
- **Condição A** (`sql/20-condicao-a.sql`): uma constraint garante que
  `indice`, `hash_anterior` e `hash` fiquem nulos. O índice na cadeia foi
  tratado como parte do encadeamento, e não do log básico: assim, A não
  paga o bloqueio da cabeça da cadeia, e a diferença medida entre A e B
  inclui tudo o que a hash chain acrescenta (bloqueio, índice e hash).
- **Condição B** (`sql/20-condicao-b.sql`): as três colunas passam a ser
  obrigatórias, e a tabela `audit.cadeias` (`casa_id`, `ultimo_indice`,
  `ultimo_hash`) guarda a cabeça de cada cadeia. O verificador não confia
  nela: compara com o checkpoint externo.
- **Serialização canônica, versão `v1`**: dez campos em ordem fixa
  (versão do formato, `casa_id`, `indice`, `operacao`, `entidade`,
  `entidade_id`, `pessoa_responsavel_id`, `usuario_registrador_id`,
  `ocorrido_em`, `conteudo`), cada um como `tamanho:valor,` (tamanho em
  bytes UTF-8), e nulo como `~`. Ficaram de fora o `id` (técnico; a
  ordem é o `indice`) e o próprio encadeamento, que entra no hash.
  Datas em UTC, `YYYY-MM-DDTHH:MI:SS.ffffffZ`, sempre com 6 casas. O
  `conteudo` entra como o texto do `jsonb` gerado pelo Postgres (chaves
  em ordem canônica do `jsonb`; `numeric(12,2)` mantém as 2 casas, por
  exemplo `10.00`).
- **Hash**: `SHA-256(hash_anterior || serialização)` em hexadecimal
  minúsculo, com `sha256()` nativo do Postgres e `crypto` do Node; hash
  inicial de 64 zeros.
- **Duas implementações**: PL/pgSQL (`audit.serializar`,
  `audit.hash_evento`) e TypeScript (`src/serializacao.ts`). A conexão do
  experimento (`src/banco.ts`) recebe todos os tipos como o texto enviado
  pelo Postgres, sem conversão, e fixa a sessão em UTC; a versão em Node
  serializa esse texto.

**Testes** (`npm run exp:test`, que recria o banco na condição B): 17
testes, todos passando em 27/11/2026, em cerca de 2 s depois da
recriação. Sete vetores fixos (inclusão comum; nulos e microssegundos
zerados; texto com acento, `:`, `,` e `~`; emoji de 4 bytes;
`numeric(12,2)` com e sem centavos; virada do ano registrada em -03;
JSON com chaves fora de ordem, aninhamento, lista e nulo) dão a mesma
serialização e o mesmo hash nos dois lados. Dois vetores têm a
serialização esperada escrita à mão (formato congelado), e o hash é
conferido nos dois lados com o vetor oficial `SHA-256("abc")` do NIST.

## Bloco 2: condições A e B (27/11/2026)

**O que foi feito**

- **Triggers comuns** (`sql/30-triggers.sql`): `AFTER INSERT OR UPDATE OR
  DELETE ... FOR EACH ROW` em `compras`, `receitas` e `parcelas`, iguais
  nas duas condições. Eles montam o evento e chamam
  `audit.gravar_evento`, a **única função diferente entre A e B**.
  - A (`sql/20-condicao-a.sql`): só grava o evento.
  - B (`sql/20-condicao-b.sql`): cria a cabeça da cadeia da Casa se
    faltar, trava com `SELECT ... FOR UPDATE`, calcula índice e hash,
    grava o evento e avança a cabeça.
- **Conteúdo**: `{"antes": ..., "depois": ...}` com `to_jsonb` da linha
  inteira (nulo do lado que não existe: `antes` no `INSERT`, `depois` no
  `DELETE`). Hora do evento: `clock_timestamp()`.
- **Quem registrou**: `lancado_por_id` da linha na inclusão de compras e
  receitas (com `app.usuario_id` como reserva, porque linhas antigas têm
  `lancado_por_id` nulo); `app.usuario_id` na inclusão de parcelas (na
  edição, as parcelas são recriadas por quem edita), com o
  `lancado_por_id` da compra como reserva; `app.usuario_id` em toda
  alteração e exclusão. Sem nenhum dos dois, a operação inteira é
  recusada.
- **Parcelas**: não têm `casa_id`; Casa e responsável vêm da compra.
  Achado no schema: o produto apaga compras de vez em um caso
  (`cancelarCompra`, compra fora de acerto), e as parcelas vão junto em
  cascata, quando a compra já não é visível. Solução: um trigger
  `BEFORE DELETE` em `compras` guarda Casa, responsável e quem lançou
  numa variável local da transação (`audit.compra_<id>`), consultada pelo
  trigger da parcela.
- **Troca de Casa** (decisão 2): um `UPDATE` que muda `casa_id` gera um
  evento na cadeia de origem e outro na de destino, com o mesmo
  conteúdo.
- **Vínculo com recorrências** (decisão 9): vincular, trocar e
  desvincular são `UPDATE` comuns, com `despesa_fixa_id` antes e depois
  no conteúdo.
- **Fora do escopo**: `TRUNCATE` (não dispara triggers de linha) e as
  tabelas de recorrência. No produto, as rotas de edição e exclusão não
  definem `app.usuario_id`; se a hash chain fosse para PROD, elas
  precisariam da função auxiliar `comAuditoria` (decisão 1).

**Testes** (`npm run exp:test`, agora em A e depois em B, cada uma com o
banco recriado do zero): 30 testes por condição, todos passando em
27/11/2026 (A: 27 executados e 3 exclusivos de B pulados; B: 29 e 1
pulado). Cobrem: um evento por linha com Casa, responsável e
registrador; `ROLLBACK` sem evento; alteração sem `app.usuario_id`
recusada sem gravar nada; reserva do registrador na inclusão; antes e
depois na alteração; vincular, trocar e desvincular recorrência; troca
de Casa com dois eventos; compra apagada com parcelas em cascata na Casa
certa; edição que recria parcelas. Só em A: eventos sem índice nem
hash. Só em B: cadeia contínua e recalculada em Node igual à gravada,
cabeça no último elo, Casas independentes, e **3 conexões gravando 25
receitas cada, ao mesmo tempo, na mesma Casa**, com índices de 1 a 75
sem repetição nem salto e a cadeia válida.

**Prova rápida de adulteração** (manual, no banco B depois dos testes):
111 eventos, todos os hashes recalculados no Postgres iguais aos
gravados; depois de trocar o `valor_liquido` de um evento de receita
para 9999.00, exatamente 1 hash deixou de bater. O verificador completo,
com o checkpoint, é o bloco 3.

## Requisitos para o gerador de dados sintéticos (anotado em 27/11/2026)

Levantados ao conferir a rota de edição de compras do produto
(`PUT /compras/:id`, `src/routes/compras.ts`):

- **A edição de compra recria as parcelas.** A compra é atualizada no
  lugar (`UPDATE`, mesmo `id` e mesmo `lancado_por_id`), mas as parcelas
  são **sempre** apagadas e recriadas, em qualquer edição: compra à
  vista (1 parcela), parcelada e até quando só a descrição muda. Uma
  edição de compra com N parcelas gera **1 + 2N eventos** (1 `UPDATE` da
  compra, N `DELETE` e N `INSERT` de parcelas). O gerador deve reproduzir
  esse padrão; gerar só o `UPDATE` da compra subestimaria o volume do log,
  o armazenamento e a latência das edições.
- **O rastro do valor de uma parcela não segue um único `entidade_id`.**
  As parcelas recriadas ganham `id` novos, então o histórico do valor se
  reconstitui pelo `compra_id` no conteúdo do evento. Levar isso em conta
  ao montar os cenários de adulteração de valor (escolher o evento-alvo e
  descrever o resultado esperado).

## Bloco 3: checkpoint e verificador (27/11/2026)

**O que foi feito**

- **Checkpoint** (`src/checkpoint.ts`): para cada Casa, o índice do
  último evento confirmado, o hash esperado nesse índice e a quantidade
  de eventos até ele, num arquivo JSON da rodada (formato `v1`). É criado
  a partir de `audit.cadeias`, lido numa transação `REPEATABLE READ READ
  ONLY` (fotografia consistente). Antes de gravar, confere que o evento
  da cabeça existe com o mesmo hash e que a quantidade bate; se não, o
  checkpoint não é criado.
- **Verificador** (`src/verificador.ts`), em Node: lê os eventos de cada
  Casa do checkpoint em texto bruto e percorre os índices de 1 até o do
  checkpoint. Não confia em `audit.cadeias` nem nas funções SQL de hash.
  Para cada índice confere, nesta ordem:
  1. **sequência**: exatamente um evento com aquele índice (falta =
     exclusão; repetição = inserção);
  2. **encadeamento**: `hash_anterior` igual ao hash do evento anterior
     (hash inicial de 64 zeros no índice 1);
  3. **hash**: SHA-256 recalculado em Node igual ao gravado.

  No fim, confere a **quantidade** de eventos até o checkpoint e se o
  **hash final** é igual ao do checkpoint.
- **Situação por Casa** (definição de método, revista em 27/11):
  - **íntegra**: todas as conferências passaram;
  - **adulterada**: alguma falhou, com o motivo (`sequencia`,
    `encadeamento`, `hash`, `quantidade` ou `checkpoint`) e o primeiro
    índice com problema;
  - **inconclusiva**: o verificador **não conseguiu processar** os eventos
    (por exemplo, evento sem índice ou campo num formato que a
    serialização recusa). O roteiro dava como exemplo "Casa do checkpoint
    sem nenhum evento"; isso foi reclassificado como **adulterada**
    (exclusão total, detectada como `sequencia` no índice 1), porque o
    checkpoint prova que os eventos existiam.
  - Eventos com índice acima do checkpoint são contados como **não
    protegidos**, sem afetar a situação.
  - A situação geral da verificação é a pior entre as Casas.
- **Medição embutida**: tempo de leitura e de cálculo por Casa e tempo
  total (`process.hrtime`).
- **Linha de comando** (`src/cli.ts`): `npm run exp:checkpoint --
  <arquivo>` e `npm run exp:verificar -- <checkpoint> [relatorio.json]`,
  com código de saída 0 (íntegra), 1 (adulterada) ou 2 (inconclusiva).

**Achado de método:** na **alteração seguida do recálculo dos hashes
posteriores**, a cadeia fica coerente e só o hash final denuncia o
ataque (motivo `checkpoint`). O verificador detecta, mas **não localiza**
o evento alterado: aponta o índice do checkpoint. Localizar exigiria
checkpoints intermediários, o que fica registrado como limitação (e
possível trabalho futuro).

**Testes** (`npm run exp:test`): 48 testes no total; em A, 27 executados
(a suíte do verificador é exclusiva de B); em B, 47 executados, todos
passando em 27/11/2026. Os ataques rodam numa transação desfeita no fim,
na mesma conexão do verificador. Cobrem: nenhum falso positivo em todas
as cadeias do banco (com dados próprios de 4 Casas, incluindo alteração,
exclusão e receita sem responsável); cadeia íntegra; eventos depois do
checkpoint como não protegidos; alteração de valor, de responsável, de
usuário registrador, de timestamp e de operação (motivo `hash`, no índice
certo); exclusão de um evento do meio, do último (com a cabeça ajustada) e
de todos (`sequencia`); inserção com índice repetido, com a constraint
derrubada (`sequencia`); inserção no meio com renumeração e recálculo
(`checkpoint`); alteração com recálculo dos posteriores (`checkpoint`);
alteração só do `hash_anterior` (`encadeamento`); o verificador ignora
`audit.cadeias` adulterada; o checkpoint recusa cabeça incoerente;
gravação e leitura do arquivo e recusa de outro formato.

Um teste dependia de dados criados por outro arquivo e falhou quando o
Jest mudou a ordem dos arquivos; passou a criar os próprios dados.

**Prova de ponta a ponta pela linha de comando** (banco B depois dos
testes): checkpoint de 34 Casas e 225 eventos; verificação íntegra em
56,6 ms (código 0). Depois de alterar o primeiro evento da Casa 1 e
recalcular todos os hashes dela (e a cabeça), a verificação acusou
`adulterada (checkpoint)` no índice 7 (código 1).

## Bloco 4: figuras e tabelas (27/11/2026)

- `FIGURAS.md`, com o material para Material e Métodos e Resultados
  Preliminares:
  - Figura 1, arquitetura: operação → trigger → `audit.gravar_evento` →
    A ou B, na mesma transação; checkpoint e verificador fora do banco;
  - Figura 2, cadeia de uma Casa com hash inicial, encadeamento,
    checkpoint e evento não protegido;
  - Figura 3, fluxo da verificação de uma Casa;
  - Tabela 1, modelo de evento: campo, tipo, origem, correspondência com
    o projeto aprovado e se entra no hash;
  - Tabela 2, o que muda entre A e B;
  - Tabela 3, cenários de adulteração com esperado em A, esperado em B e
    o obtido nos testes funcionais do bloco 3.
- Diagramas em Mermaid, exportados em 27/11 para `figuras/` (PNG em 2x
  com fundo branco e SVG) com o `mermaid-cli` 11, depois que a autora
  liberou a ferramenta (ela usa um navegador headless, que de início não
  foi autorizado). A renderização confirmou a sintaxe dos três
  diagramas; a Figura 3 ganhou o rótulo "i ≤ N" na volta do laço. Depois,
  o `mermaid-cli` 11.17.1 virou devDependency do back, e as figuras passam
  a ser geradas com `npm run exp:figuras`. A Figura 3 não sai idêntica byte
  a byte entre gerações (as curvas das setas variam em décimos de pixel,
  sem diferença visível); as imagens só são commitadas quando um
  diagrama muda.
- Pendente da autora até 13/12: confirmar a definição de "inconclusiva"
  (bloco 3) antes do piloto.

## Piloto (27/11/2026)

**Como foi feito**

- Código: commit `a303c2e` da `pesquisa/hashchain`, sem alterações
  pendentes, nas 12 rodadas (conferido nos `ambiente.json`). Mesmo
  ambiente do bloco 0: Postgres 17.12, 4 CPUs, 4 GB. Supabase local do DEV
  parado durante as rodadas.
- **Gerador** (`src/gerador.ts`), com semente fixa: 12 pessoas, cada uma
  com o seu espaço pessoal, 4 Casas compartilhadas com 2 a 4 membros, 5
  categorias e 2 despesas fixas por Casa. 60% das inclusões caem em Casas
  compartilhadas. Mistura de operações (suposição declarada, sem dados
  reais de uso): inserir compra 35%, inserir receita 20%, editar compra
  15% (atualiza a compra e recria as parcelas, como o produto), editar
  receita 8%, vincular/trocar/desvincular recorrência 7%, cancelar compra
  5%, apagar receita 4%, apagar compra (parcelas em cascata) 3%, mudar de
  Casa 3%. Parcelas: 70% à vista, o resto de 2 a 12 vezes. O plano fecha
  em exatamente N eventos (a última operação que passaria do alvo vira
  uma inclusão de receita, 1 evento). Mesma semente, mesmo plano em A e
  em B.
- **Carga** (`src/carga.ts`): uma conexão, uma operação por transação,
  em sequência. Latência de escrita = do `BEGIN` ao fim do `COMMIT`,
  medida no cliente com `process.hrtime`. Vazão = operações (ou eventos)
  pelo tempo total da carga.
- **Armazenamento**: `pg_total_relation_size` de `audit.eventos` (tabela,
  índices e TOAST) mais `audit.cadeias` em B, depois de `VACUUM (ANALYZE)`
  nas tabelas de auditoria.
- **Verificação** (só B): checkpoint de todas as Casas logo depois da
  carga e verificação completa em seguida.
- **Cenários** (`src/cenarios.ts`): as 12 variantes da Tabela 3, cada uma
  com 10 alvos sorteados (semente derivada da semente da rodada), 120
  ataques por rodada, cada um numa transação desfeita no fim. Os ids dos
  eventos são os mesmos em A e em B, então os alvos são idênticos
  (conferido).
- **Desenho do piloto** (`npm run exp:piloto`): A e B × 1.000 e 10.000
  eventos × sementes 1, 2 e 3 (pareadas), com a ordem A/B alternada a cada
  semente. 12 rodadas; resumo em `resultados/2026-11-27-piloto/resumo.csv`
  (cópia no workspace).

**Resultados**

| Volume | Semente | Latência mediana A / B (ms) | B/A | p95 A / B (ms) | Bytes por evento A / B | B/A | Verificação B | Detectados A / B |
|---|---|---|---|---|---|---|---|---|
| 1.000 | 1 | 2,83 / 3,15 | 1,11 | 6,43 / 7,67 | 631 / 893 | 1,42 | 30 ms | 0 / 110 de 120 |
| 1.000 | 2 | 3,10 / 3,23 | 1,04 | 6,51 / 7,26 | 623 / 868 | 1,39 | 26 ms | 0 / 110 de 120 |
| 1.000 | 3 | 3,15 / 3,30 | 1,05 | 7,61 / 7,19 | 614 / 868 | 1,41 | 28 ms | 0 / 110 de 120 |
| 10.000 | 1 | 2,74 / 2,91 | 1,06 | 6,60 / 6,89 | 557 / 733 | 1,32 | 94 ms | 0 / 110 de 120 |
| 10.000 | 2 | 2,49 / 2,69 | 1,08 | 6,17 / 6,92 | 557 / 734 | 1,32 | 115 ms | 0 / 110 de 120 |
| 10.000 | 3 | 3,20 / 3,05 | 0,95 | 7,47 / 7,69 | 555 / 735 | 1,32 | 85 ms | 0 / 110 de 120 |

- **Correção funcional**: todas as rodadas sem erro, com exatamente N
  eventos; **nenhum falso positivo** nas verificações completas de B; os
  1.440 ataques (12 rodadas × 120) tiveram o resultado esperado.
- **Detecção (H1)**: em B, as 11 variantes protegidas foram detectadas
  em 100% das tentativas, com o motivo esperado; a inserção depois do
  checkpoint, em 0%, como previsto (não protegida). Em A, nenhuma
  detecção e nenhum ataque barrado por constraint.
- **Armazenamento (H2)**: B ocupa cerca de **32% a mais** com 10.000
  eventos e 39% a 42% a mais com 1.000 (a parte fixa pesa mais em volume
  pequeno). Variação entre sementes muito pequena.
- **Verificação (H2)**: 26 a 30 ms com 1.000 eventos e 85 a 115 ms com
  10.000 (cerca de 10 µs por evento em 10.000; o custo fixo de uma consulta
  por Casa pesa mais em 1.000).
- **Latência (H2)**: a razão B/A das medianas ficou entre 0,95 e 1,11
  (cerca de +5%), mas a **variação entre repetições** da mesma condição é
  do mesmo tamanho ou maior: coeficiente de variação das medianas entre
  sementes de 5,7% (A, 1.000), 2,3% (B, 1.000), 12,8% (A, 10.000) e 6,2%
  (B, 10.000). Com 3 repetições, o efeito na latência **não se distingue
  do ruído**.
- **Aquecimento**: as primeiras 100 operações de cada rodada têm mediana
  5% a 15% maior que o restante.
- Uma rodada de teste anterior, com o Supabase local do DEV ligado, deu
  mediana de 6,65 ms em A e 4,87 ms em B (o dobro do piloto, e com A mais
  lenta): o ruído do ambiente supera o efeito medido. Daí a regra de
  desligar o DEV nas rodadas.

**Consequências para a coleta principal** (a decidir antes dela)

1. **Descartar o aquecimento** da estatística de latência (por exemplo,
   as primeiras 100 operações) ou rodar uma carga de aquecimento antes.
2. **Mais repetições** para a latência: com coeficiente de variação de
   até 13% entre repetições e efeito de cerca de 5%, 3 repetições não
   bastam. Estimar o número a partir destes dados (por exemplo, 10 ou
   mais por célula) e relatar a razão B/A pareada por semente com
   intervalo de confiança.
3. Armazenamento, verificação e detecção já são estáveis com 3
   repetições.
4. O volume de 100.000 eventos ainda não rodou (cerca de 2 minutos de
   carga por rodada, pela escala observada).

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

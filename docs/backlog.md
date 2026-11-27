# Backlog — se-controle-backend

> Atualizado em 2026-11-26. Fonte da verdade dos pendentes; as decisões já
> tomadas estão em `decisoes-superficie-api.md`.

## Entregue recentemente

- ✅ **Espaço pessoal (Casa Pessoal)** (#71, contrato 3.12.0, em PROD em
  2026-11-26) — `casas.pessoal` e `dono_pessoa_id`; criado para toda
  pessoa com login (migration `1785200000000`, `/auth/me`, vínculo e
  aceite de convite); 409 para convites, membros, papel, custeio, edição e
  desativação; "Pessoal" é nome reservado. Junto: `GET /casas` passou a
  listar só as casas de que a pessoa participa (antes listava as de todas
  as famílias). Especificação no workspace:
  `docs/planos/concluidos/casa-pessoal-nucleo.md`.
- ✅ **Convites de casa desativada** (#70, 2026-11-26) — criar e aceitar
  convite de casa desativada dá 409; desativar expira os pendentes. Regras
  em `convites.md`.
- ✅ **Status realizado das fixas** (#69, contrato 3.11.0, 2026-11-26) — o
  status de despesas e receitas fixas traz `realizado_em`,
  `valor_realizado` e os lançamentos vinculados (detalhe do "Já paga").
- ✅ **Visão de caixa** (#67, contrato 3.10.0, 2026-11-26) —
  `GET /compras/caixa?de&ate` e filtro `de`/`ate` em `GET /receitas`.
- ✅ **CI e RLS** (#65 e migration `1785100000001`, 2026-11-25) — tsc e
  testes em todo PR e push para develop e main; `package-lock.json`
  versionado; RLS ligado em `onboarding_pessoas`.
- ✅ **Projeção de saldo** (`GET /saldo-projetado`, PR #28) — evolução de
  cartoes_contas (tipo aplicacao, saldo_base, conta_debito_id), conta destino
  nos contratos com herança, PIX exige conta, compartilhamento de saldo
  opt-in. **Frontend concluído** (jul/2026), incluindo os handoffs
  anteriores (despesas/receitas fixas, fuso, exceções).
- ✅ **Ícone e cor em categorias e formas_pagamento** (PRs #35/#36,
  jul/2026) — colunas curadas no banco em vez de mapa fixo no cliente.
  Consumido no app pelos selectors (CategoriaSelector, CartaoContaSelector,
  FormaPagamentoSelector — PRs #34–#36 do se-controle-rn).
- ✅ **Competência default deriva da data** (handoff PR #34; fix no app na
  PR #33 do se-controle-rn) — dados históricos já corrigidos no banco.
- ✅ **Reajuste atômico** (jul/2026, contrato 3.8.0) —
  POST /despesas-fixas/:id/reajustar e /receitas-fixas/:id/reajustar:
  encerrar + criar sucessora numa transação. Robustez pré-onboarding da
  família. **Frontend concluído** (PR #40 do se-controle-rn, jul/2026).
- ✅ **Relatório de gastos** (jul/2026, contrato 3.7.0) —
  GET /relatorios/gastos: matriz mês × categoria × pessoa por casa, eixo
  competência|caixa, ícone/cor de categoria na resposta. **Frontend
  concluído** (PR #38 do se-controle-rn, jul/2026).
- ✅ **Acerto de contas / reembolso** (jul/2026, contrato 3.6.0) —
  GET /casas/:id/acerto (conta corrente entre pessoas) + POST/DELETE de
  pagamentos/adiantamentos; eixo competência|caixa com precedência
  casa→compra. Implementa em código a regra de `regra-rateio-custeio.md`.
  Dados de produção: Karina criada (pessoa 39, admin da casa 2, inicialmente
  sem e-mail). Quando o acesso for ativado, manter `auth.users.email` e
  `pessoas.email` sincronizados antes de usar a recuperação de senha.
  Combinado JUL-26 registrado (Karina 100 / Erica 0). **Frontend concluído**
  (PR #37 do se-controle-rn, jul/2026).
- ✅ **Convites internos e por e-mail** (PR #50, contrato 3.9.x) — o
  backend decide o tipo consultando o Supabase Auth e vincula a pessoa já
  existente no aceite. Regras em `convites.md`.
- ✅ **Relatórios persistentes de acerto** — confirmação idempotente,
  snapshot imutável, histórico, detalhe, geração de PDF/CSV com nova tentativa,
  controle de acesso por casa e estornos para compras canceladas após o acerto.

## ✅ Separar `.env` local de `.env` prod (resolvido em 2026-11-19)

Antes, o `back/.env` apontava para **produção** e era carregado
implicitamente por `src/server.ts` (`dotenv/config`), pelo
`node-pg-migrate` e pelos scripts de seed/clean (`require('dotenv')`).
`npm run dev` e `npm run migrate:up` atuavam em prod.

Resolução (Fase 0, passo 1 do plano de ambientes do workspace —
`docs/planos/estrategia-ambientes-e-roadmap-baseline-tcc.md`, 4.7):

- Nenhum código carrega `.env` implicitamente. Variáveis vêm do script npm
  (`dotenv -e .env.<ambiente>`) localmente e do Railway em produção.
- Migrations usam `--envPath`, então o `node-pg-migrate` lê **só** o
  arquivo do ambiente escolhido.
- Ambientes locais: `.env.dev` (Supabase local) e `.env.tcc` (antigo
  `.env.hml`). **Não existem scripts `:prod` locais.**
- `.gitignore` cobre `.env*` (exceto `.env.example`).

Pendências relacionadas, fora deste item:

- O arquivo `back/.env` (credenciais de prod) **ainda existe** na máquina
  local por decisão de 2026-11-19. Não é mais carregado por nenhum script,
  mas deve ser removido no passo de gestão de segredos (10.10 do plano).
- ~~Definir como as migrations rodam em prod~~ **Decidido:** manual, antes
  do merge em `main`, depois de backup e teste de restauração (ver
  `README.md` e `docs/ambiente/release.md` no workspace).
- Guarda opcional `APP_ENV` (4.7, item 7 do plano).

Estado das migrations conferido em 2026-11-26 (dry-run antes da release
#73): a última migration aplicada em **prod** e no **TCC** é
`1785200000000` (Casa Pessoal). Ambientes alinhados.

## ✅ Backup e restauração (resolvido em 2026-11-19)

O Supabase gratuito não faz backup. Foram criados `db:backup:prod`,
`db:backup:tcc` e `db:restore-test` (`scripts/backup-db.sh`,
`scripts/restore-test-db.sh`, `scripts/db-manifest.js`): dump pela CLI do
Supabase, criptografia AES-256 e teste de restauração numa instância
descartável, conferindo as contagens com o manifesto. Validado de ponta a
ponta no TCC. Procedimento: `se-controle-workspace/docs/ambiente/backup-restauracao.md`.

## Próximos candidatos

- **Motor de cenários** — formalizar o motor de projeção como camada pura e
  isolada: recebe estado real (contratos vigentes de despesa_fixa/
  receita_fixa, faturas, saldos) + conjunto de **deltas hipotéticos**,
  devolve linha do tempo projetada, sem efeitos colaterais e sem persistir
  nada no ledger. Sobre ele, introduzir a entidade **`cenario`** = estado
  real + deltas (transação fictícia, contrato alterado, contrato encerrado),
  persistível e comparável lado a lado. Responde às três perguntas-tese:
  comprometimento de renda (agregação), "posso comprar X?" (transação
  simulada), "e se a renda cair 20%?" (contrato modificado).
  **Pré-requisito**: desacoplar a lógica de projeção da tela atual de saldo
  projetado (hoje o cálculo vive em `services/saldoProjetado.ts` acoplado ao
  escopo/params do endpoint). Coerente com os princípios existentes:
  derived views over stored state; comportamento ≠ classificação.
- **Projeção no tempo (gráfico)**: o endpoint já devolve a timeline de
  eventos por conta — a UI decide granularidade; se precisar de série diária
  agregada pelo backend, é evolução pequena do service.
- **Despesa fixa esperada em cartão de crédito**: hoje projetada na
  data_esperada (simplificação); refinamento futuro é projetá-la no
  vencimento da fatura em que cairia.

## Backlog de features (sem urgência, já com contexto)

- **Hash chain** — intenção antiga de adicionar uma cadeia de hash ao
  backend (integridade/auditoria de lançamentos). Nunca escopado.
- **Checagem de coerência de valor nas exceções** — o status compara
  existência, não valor; `valor_ocorrido`/`valor_esperado_original` já
  gravados preparam essa checagem.
- **Motivos categorizados de exceção** — hoje texto livre (`motivo`).
- **Suavização de valor de receitas variáveis** — média de meses anteriores
  para `valor_esperado` de freelance (decisão da modelagem de receitas fixas).

## Micro-melhorias (fazer quando incomodar)

- **`pode_editar` nos GETs de despesas/receitas fixas** — compras/receitas
  têm; fixas não. Adicionar se o frontend sentir falta (o app pode inferir
  pelo papel na casa enquanto isso).
- ~~Aba de performance do linter do Supabase~~ — revisada em jul/2026:
  auth_rls_initplan (2, pessoas) corrigidos e as 30 FKs sem índice
  indexadas. Os 4 `unused_index` são os índices intencionais de gap
  detection/projeção — mantidos de propósito (base pequena usa seq scan;
  pagam quando o volume crescer). Ignorar `unused_index` enquanto a base
  for pequena. Segurança já tratada na PR #26.

## Riscos aceitos (reavaliar se o contexto mudar)

- **Leaked Password Protection desligada** — exige plano pago; aceito no
  free tier. Ligar no dashboard (Auth → senha) se migrar de plano; nesse
  caso, conferir se o cadastro do app exibe o erro `weak_password`.
- **Pool do backend é superuser e bypassa RLS** — por design; a autorização
  efetiva é a da camada de app, e o RLS é defesa em profundidade para o
  acesso direto via Supabase.

## Do lado do frontend (se-controle-rn)

- ✅ Todos os handoffs consumidos (despesas/receitas fixas, fuso, exceções,
  saldo projetado, competência default, ícone/cor, acerto de contas,
  relatório de gastos e reajuste atômico) — app em dia com o contrato
  3.8.0.

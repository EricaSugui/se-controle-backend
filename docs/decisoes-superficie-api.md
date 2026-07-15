## Decisão: Superfície de escrita da API (o que é fechado e por quê)

### Contexto

Nem todo recurso do domínio é criado, editado ou removido via API. Foi
decidido deliberadamente fechar ou reduzir a superfície de escrita de vários
recursos, seguindo três princípios:

1. **Catálogos de referência são geridos apenas por admins do sistema** —
   a escrita via API existe, mas é restrita ao papel global `admin_sistema`
   (diferente do admin de casa). Não há seed nas migrations.
2. **Entidades derivadas nascem apenas pelo fluxo que as origina** — não têm
   endpoint próprio de criação.
3. **Nada tem delete físico exposto** — ou é desativação lógica, ou não
   existe remoção.

### Tabelas de referência — leitura geral, escrita só para admin do sistema

As três passam pelo mesmo `src/routes/lookupRouter.ts`:

| Recurso | Rota |
|---|---|
| `categorias` | `src/routes/categorias.ts` |
| `formas_pagamento` | `src/routes/formasPagamento.ts` |
| `origens_receita` | `src/routes/origensReceita.ts` |

- `GET /` (com filtro opcional `?ativo=`) — qualquer usuário autenticado.
- `POST /`, `PUT /:id`, `PATCH /:id/ativar`, `PATCH /:id/desativar` —
  apenas pessoas com `admin_sistema = true` (middleware `adminSistema` em
  `src/middleware/auth.ts`). Sem DELETE físico, como no resto do sistema.

**Admin do sistema ≠ admin de casa**: `admin_sistema` é uma flag global na
tabela `pessoas`, para gestão dos catálogos compartilhados (e futuramente um
painel administrativo no frontend). Admin de casa (`casa_pessoas.papel`)
continua valendo só dentro da casa.

Reforço no banco: policies de RLS de SELECT para `authenticated`
(`1783556122244_add-rls-policies-tabelas-referencia.js`) e de INSERT/UPDATE
condicionadas a `private.admin_sistema()`
(`1783637000000_add-admin-sistema.js`). Não há policy de DELETE.

### Entidades derivadas — sem criação direta

| Recurso | O que a API expõe | Como nasce |
|---|---|---|
| Faturas | `GET /`, `GET /:id` e `PUT /:id` restrito a ajustar datas (abertura/fechamento/vencimento), apenas pelo titular. Sem POST e sem DELETE. | Automaticamente, no fluxo de compras |
| Parcelas | Somente leitura via `GET /compras/:id/parcelas`. Nenhuma rota de escrita. | Geradas junto com a compra |

### Escrita reduzida (sem PUT/DELETE convencionais)

| Recurso | Decisão |
|---|---|
| Percentuais de custeio | Sem PUT e sem DELETE. `POST` faz upsert por (casa, pessoa, competência), restrito a admins da casa. O histórico por competência é a forma de "editar". |
| Casas | Sem DELETE físico — desativação lógica via `PATCH /:id/ativar` e `PATCH /:id/desativar`. |
| Cartões/contas | Sem DELETE físico — mesmo padrão ativar/desativar. |
| Convites | Sem DELETE — o ciclo de vida é aceitar ou expirar, via PATCH. |
| Pessoas | Sem DELETE (só GET, POST e PUT). |
| Dashboard e fechamento mensal | Somente GET — são visões calculadas, sem escrita. |

### Despesas fixas — vigência, versionamento e vínculo com compras

`despesas_fixas` é o "contrato" recorrente (aluguel, assinatura); as
ocorrências pagas são compras normais vinculadas a ele.

- **Sem DELETE físico** (nem policy de RLS de DELETE) — o ciclo de vida é
  encerramento via `PATCH /despesas-fixas/:id/encerrar`, que define
  `vigente_ate` (default hoje). Encerrada hoje, segue vigente até o fim do
  dia.
- **"Ativa" é derivado da vigência**, não armazenado: vigente =
  `vigente_ate` nulo ou >= hoje (filtro `?vigente=` no GET).
- **Reajuste = versionamento explícito**: encerrar o registro atual e criar
  um novo com `despesa_fixa_anterior_id` apontando para ele (a anterior
  precisa estar encerrada e no mesmo escopo). O PUT não bloqueia editar
  `valor_referencia` — corrigir um typo não pode exigir versão nova — mas a
  orientação de produto para contratos de valor `fixo` é versionar.
- **Escopo (casa/pessoa) imutável após a criação**, como em metas; a
  autorização segue o mesmo padrão (leitura: membro da casa ou dono;
  escrita: admin da casa ou dono).
- **Vínculo em compras**: `competencia_referencia` exige `despesa_fixa_id`
  (CHECK no banco); omitida, assume a competência da compra; precisa estar
  na vigência do contrato; despesas anuais só aceitam o mês-âncora (mês de
  `vigente_desde`), evitando falso-gap.
- **Gap detection é derivado, não armazenado**: `GET /despesas-fixas/status`
  calcula as competências esperadas e compara com as compras vinculadas
  (`pago` / `em_dia` / `vencendo_hoje` / `em_atraso`, com folga configurável
  após o `dia_esperado`).
- **Futuro (fora do MVP)**: tabela `despesa_fixa_excecao` para silenciar gap
  legítimo (carência, isenção pontual) e `POST /:id/reajustar` atômico.
  Enquanto não existem, o caminho é ajustar a vigência ou conviver com o
  item em aberto, e versionar em duas chamadas.

### Receitas fixas — espelho de despesas fixas

`receitas_fixas` segue exatamente as decisões de despesas fixas (vigência
derivada, sem DELETE, versionamento por sucessão via
`receita_fixa_anterior_id`, escopo imutável, vínculo das ocorrências em
`receitas` com `competencia_referencia`, mês-âncora para anuais). Diferenças
deliberadas:

- **Catálogo**: `origem_id` → `origens_receita` (o catálogo de receitas),
  não `categorias`.
- **`valor_esperado` é opcional** — receita recorrente de valor incerto
  (freelance) pode não ter estimativa. `tipo_confiabilidade`
  (`fixa`/`variavel`) distingue CLT de freelance na mesma tabela.
- **`dia_esperado_recebimento`** — nome sem conotação de cobrança.
- **Status com 3 estados**: `recebido` / `aguardando` / `atrasado` (sem o
  intermediário "vencendo hoje" das despesas; a folga é só a régua entre
  aguardando e atrasado). Sem estado "interrompida": vigência encerrada para
  de gerar linhas.
- Receita pontual/avulsa continua indo direto em `POST /receitas`, sem
  passar por template.
- **Vínculo pessoal exige `pessoa_id` na receita** (em receitas o campo é
  opcional); e como `competencia` também é opcional, vincular sem nenhuma
  das duas competências é 400.

### Fuso horário — "hoje" é do usuário, não do servidor

Toda lógica sensível a "hoje" (status de despesas/receitas fixas, filtro
`?vigente=`, default do encerrar) usa o fuso da pessoa autenticada
(`pessoas.fuso_horario`, IANA, default `America/Sao_Paulo`), não UTC nem o
relógio do servidor. Editável via `PUT /pessoas/:id`; validado com `Intl`
(qualquer fuso IANA). Datas **gravadas** (`data`, `competencia`) sempre foram
fornecidas pelo cliente e não são afetadas.

### Por quê

- Catálogos (categorias, formas de pagamento, origens de receita) mudam
  raramente e valem para todos os usuários; expor escrita via API criaria
  necessidade de controle de permissão global sem benefício real.
- Faturas e parcelas são consequência de uma compra — permitir criação
  avulsa quebraria a consistência entre compra, parcelas e fatura.
- Delete físico destruiria histórico financeiro; desativação lógica
  preserva relatórios e referências antigas.

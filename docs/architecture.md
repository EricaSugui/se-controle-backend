app/
├── (auth)/
│   ├── _layout
│   ├── login
│   └── cadastro
│
├── (app)/
│   ├── _layout               ← tab navigator (4 abas)
│   ├── dashboard/
│   │   └── index
│   ├── gastos/
│   │   ├── index             ← lista de gastos
│   │   └── [id]              ← detalhe / edição
│   ├── orcamento/
│   │   └── index
│   └── mais/
│       ├── index             ← menu de opções
│       ├── receitas/
│       │   ├── index
│       │   └── [id]
│       └── relatorios/
│           └── index
│
└── index                     ← redireciona auth → (app) ou (auth)


src/
├── components/
│   ├── ui/                   ← componentes genéricos (Button, Input, Card)
│   └── domain/               ← componentes de negócio (GastoCard, OrcamentoBar)
│
├── hooks/                    ← useGastos, useReceitas, useOrcamento
│
├── services/
│   ├── api/                  ← chamadas ao Express (gastos, receitas, etc)
│   └── supabase/             ← client do supabase, auth
│
├── context/                  ← AuthContext, GrupoContext
│
├── utils/                    ← formatadores de moeda, data, etc
│
└── types/                    ← tipos TypeScript do domínio

(auth) e (app) são route groups do Expo Router — não viram segmento de URL
Todo acesso a dados passa por services/ — componentes nunca chamam API diretamente
context/ guarda estado global (usuário logado, grupo familiar)
components/ui/ é agnóstico de negócio — components/domain/ conhece o domínio

## Acerto e relatórios persistentes

O acerto corrente é calculado a partir das compras e dos pagamentos registrados.
Quando o usuário confirma um acerto, o backend grava um snapshot imutável em
`acertos`, incluindo participantes, meses, saldos e avisos. A confirmação
exige um header `Idempotency-Key`, evitando duplicação em reenvios.

Os endpoints de relatório são montados em
`/casas/:casaId/acertos`: confirmação, listagem, detalhe e geração de PDF/CSV.
A geração de arquivo é registrada em `acerto_arquivos` e cada tentativa gera
um evento em `acerto_eventos`; falhas podem ser repetidas sem desfazer o
relatório confirmado.

Se uma compra já incluída em um relatório for cancelada, o backend registra um
estorno para o próximo acerto em vez de alterar o snapshot histórico.

## Testes e desenvolvimento

- **TDD é a prática preferencial para código novo e mudanças relevantes**:
  escrever um teste que expresse o comportamento esperado, implementar a
  menor mudança necessária e refatorar mantendo os testes passando.
- **Jest** é o runner padrão para testes unitários do backend.
- Testes unitários devem priorizar regras de domínio, services, utils e
  validações de entrada, isolando banco, autenticação e serviços externos com
  mocks ou fakes.
- Testes de integração devem validar rotas Express, autenticação, autorização,
  transações e queries/migrations quando o comportamento depender da
  integração com PostgreSQL.
- O código legado será coberto progressivamente, começando por regras
  financeiras e fluxos alterados. A ausência atual de testes não deve impedir
  melhorias incrementais.
- Toda correção de bug deve incluir um teste de regressão sempre que o
  comportamento puder ser reproduzido automaticamente.
- Uma mudança só deve ser considerada concluída quando os testes direcionados
  passarem; o conjunto completo deve ser executado quando a alteração afetar
  contratos, autenticação ou infraestrutura compartilhada.
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
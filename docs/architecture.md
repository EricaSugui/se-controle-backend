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
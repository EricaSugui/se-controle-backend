## Regra: Rateio de Despesas entre Casas (Custeio)

### Contexto

Quando uma casa (ex: Casa da Mamãe) tem despesas pagas por mais de uma pessoa
(ex: a própria filha e outra filha), o sistema precisa saber quanto cada uma
deve, sem duplicar valores no saldo da casa.

Existem duas fontes de informação, com propósitos diferentes:

| Tabela | Representa | Granularidade |
|---|---|---|
| `percentual_custeio` | O **combinado** entre as pessoas — a regra padrão de divisão | Por casa + competência (mês) |
| `transacao_pagadores` | O **realizado** — quem de fato pagou cada gasto específico | Por transação individual |

Nenhuma das duas atualiza a outra automaticamente. Elas coexistem e são
combinadas apenas na hora de **ler/calcular** um relatório.

### Regra de prioridade

Para calcular quanto cada pessoa deve em uma despesa de uma casa com custeio
compartilhado, aplicar, **por transação**:

```
SE existe registro em transacao_pagadores para essa transação
  → usar o rateio específico ali definido (exceção pontual)
SENÃO
  → usar o percentual_custeio vigente para aquela casa + competência (regra padrão)
```

### Exemplo aplicado

Combinado em `percentual_custeio` para Casa da Mamãe, competência JUN-26:
- Você: 20%
- Irmã: 80%

- Transação "Conta de luz — R$200" **sem** registro em `transacao_pagadores`
  → aplica o padrão: você deve R$40, irmã deve R$160.

- Transação "Remédio — R$100" **com** registro em `transacao_pagadores`
  (Você 100%) → ignora o padrão para esse caso específico: você deve R$100,
  irmã não deve nada nessa transação.

### Por que não usar `receitas` para registrar o rateio

Lançar a parte paga por um terceiro como `receita` da casa duplicaria o
valor: o gasto já existe na `transacoes` (ex: R$200), e uma receita extra de
R$160 inflaria artificialmente o saldo da casa. O rateio é apenas uma
"etiqueta" de quem pagou — não é dinheiro novo entrando na casa.

`receitas` deve ser usada somente quando há transferência real de dinheiro
para dentro do orçamento da casa (ex: mesada fixa), não para registrar
quem bancou um gasto pontual.

### Onde isso se aplica

Essa regra é necessária especificamente em casas administradas por mais de
uma pessoa fora do núcleo que mora nela (ex: filhos que dividem o custeio
de um dos pais). Em casas de custeio único, ambas as tabelas ficam
naturalmente vazias/irrelevantes.

# Handoff frontend — Relatório de gastos (contrato 3.7.0)

> Backend entregue em 2026-07-25. Contexto de produto em
> `relatorio-gastos.md`. Motivação: "para onde foi meu dinheiro" — gasto
> por categoria, por pessoa e o cruzamento ("quem gasta mais com
> educação"), sempre por casa.

## Endpoint único

```
GET /relatorios/gastos?casa_id=1&de=FEV-26&ate=JUL-26&eixo=competencia
```

- `casa_id` **obrigatório** — nunca mistura casas.
- `de`/`ate` opcionais, formato competência `MMM-AA`. Default: janela de
  6 meses terminando na competência atual (fuso do usuário).
- `eixo` opcional: `competencia` (default) | `caixa`.

## Resposta: a matriz, não as visões

`linhas`: uma por `(mes, categoria, pessoa)` com `total`, ordenadas por
mês cronológico → categoria → pessoa. Cada linha já traz
`categoria_nome`, `categoria_icone` (MaterialCommunityIcons) e
`categoria_cor` — sem lookup extra.

O app deriva tudo client-side:

- **Por categoria da casa**: soma das linhas do mês agrupando por
  categoria.
- **Por pessoa**: soma agrupando por pessoa ("gastos da Malu").
- **Drill-down categoria × pessoa**: as linhas cruas de uma categoria
  ("dentro de Educação, quem gasta o quê").
- **Evolução mensal**: mesma agregação, série pelos `mes` do intervalo.
  Mês sem gasto não vem — tratar como zero no gráfico.

## Semânticas

- **"Pessoa" = responsável pelo gasto** (`compras.pessoa_id`), não quem
  pagou — "quem bancou" é a tela de acerto de contas.
- **Eixo competência**: compra parcelada entra INTEIRA no mês da
  competência (pergunta "para onde foi o dinheiro").
- **Eixo caixa**: cada parcela entra no mês da `data_caixa` (pergunta "o
  que saiu/sai do bolso") — parceladas se espalham; os totais dos dois
  eixos convergem no acumulado, mas diferem mês a mês.
- Não há paginação: o volume é limitado (meses × categorias × pessoas
  com gasto). 6 meses da casa 1 hoje ≈ 35 linhas.

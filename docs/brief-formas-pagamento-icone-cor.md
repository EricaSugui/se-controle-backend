# Brief técnico — icone/cor em formas_pagamento

> Brief para levar ao Claude Code do repo do backend (se-controle-backend).
> Espelha exatamente o que foi feito para `categorias`
> (migration `1784495939270_add-icone-cor-to-categorias.js`).

## Contexto

O app (se-controle-rn) já tem um `CategoriaSelector` (chip colorido + bottom
sheet) consumindo `icone`/`cor` de `GET /categorias`. Queremos o mesmo padrão
visual para forma de pagamento (`FormaPagamentoSelector`), usado em
`CompraForm`.

`formas_pagamento` tem a mesma forma de `categorias`: catálogo curado com
`nome` livre (gerido pelo painel admin), sem enum fixo — diferente de
`cartao_conta.tipo`, que é um enum de 3 valores e por isso ficou resolvido
só no cliente (mapa fixo, sem mudança de backend). Aqui o precedente correto
é o de categoria: colunas no banco, não mapa no cliente — evita duplicar/
dessincronizar um lookup toda vez que o admin criar ou renomear uma forma de
pagamento.

## Escopo

### 1. Migration

Adicionar à tabela `formas_pagamento`, espelhando a de categorias:

```js
exports.up = (pgm) => {
  pgm.addColumns('formas_pagamento', {
    icone: { type: 'text', notNull: true, default: 'dots-horizontal-circle-outline' },
    cor: { type: 'text', notNull: true, default: '#9E9E9E' },
  });

  pgm.addConstraint('formas_pagamento', 'formas_pagamento_cor_hex_check', "CHECK (cor ~ '^#[0-9A-Fa-f]{6}$')");

  pgm.sql(`
    UPDATE formas_pagamento SET icone = dados.icone, cor = dados.cor
    FROM (VALUES
      ('Boleto', 'barcode', '#8D6E63'),
      ('Crédito', 'credit-card-outline', '#5C6BC0'),
      ('Débito', 'bank-outline', '#42A5F5'),
      ('Dinheiro', 'cash', '#43A047'),
      ('PIX', 'pix', '#00BFA5')
    ) AS dados(nome, icone, cor)
    WHERE formas_pagamento.nome = dados.nome
  `);
};

exports.down = (pgm) => {
  pgm.dropConstraint('formas_pagamento', 'formas_pagamento_cor_hex_check');
  pgm.dropColumns('formas_pagamento', ['icone', 'cor']);
};
```

**⚠️ Confirmar antes de rodar**: ao contrário de `categorias` (cujos nomes
vieram de uma migration anterior e eram conhecidos), `formas_pagamento` não
tem seed no histórico de migrations deste repo — os registros parecem ter
sido criados manualmente/via admin. Conferir o `nome` exato de cada linha em
produção (acentuação, maiúsculas, eventual "Cartão de crédito" em vez de só
"Crédito" etc.) antes do backfill, porque o `UPDATE ... WHERE nome = dados.nome`
é por igualdade exata — nome que não bater fica só com o default (ícone
neutro cinza), silenciosamente.

### 2. Rota

Nenhuma mudança necessária — `GET /formas-pagamento` já usa o
`lookupRouter` genérico (`SELECT *`), então `icone`/`cor` aparecem no
payload assim que existirem na coluna, do mesmo jeito que aconteceu com
categorias.

### 3. Ícone do PIX — atenção, família diferente

Todos os outros ícones sugeridos (`barcode`, `credit-card-outline`,
`bank-outline`, `cash`) são da família `MaterialCommunityIcons`, a mesma que
o app já usa em categoria e cartão/conta. O `pix` **não existe** nessa
família — ele mora em `MaterialIcons` (Material Symbols do Google), dentro
do mesmo pacote `@expo/vector-icons` que o app já usa.

Isso é uma decisão do lado do app (o schema aqui não muda por causa disso —
`icone` continua sendo só o nome do glyph, texto livre, sem CHECK de enum,
igual categoria). Só documentando para não gerar confusão se alguém tentar
renderizar `pix` com `MaterialCommunityIcons` e não encontrar o ícone. A
solução do lado do app deve ser uma pequena allowlist local ("nomes que
pertencem a `MaterialIcons`", hoje só esse um caso) — não uma coluna nova de
"família do ícone" no banco, que seria over-engineering para uma exceção só.

(Existe também um `pix` na família `FontAwesome6` — mas só no estilo
"Brands", que exige um prop extra (`iconStyle="brand"`) e uma fonte separada.
`MaterialIcons` é mais simples e foi a escolha recomendada.)

## Fora de escopo

- Customização de ícone/cor por usuário (igual categoria — fica pra depois).
- Resolver "família de ícone" de forma genérica no schema — é uma exceção
  pontual (só o PIX), resolvida no cliente.

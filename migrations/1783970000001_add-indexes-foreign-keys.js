// Alerta de performance do linter do Supabase (unindexed_foreign_keys):
// Postgres não indexa FK automaticamente. Cobre os 30 apontados — inclui os
// lookups mais quentes do app (casa_pessoas.pessoa_id roda em praticamente
// toda request; compras.casa_id em todo GET de compras). FKs já cobertas por
// prefixo de UNIQUE (faturas, parcelas, exceções, visibilidade.cartao_id,
// percentuais.casa_id) não precisaram.
//
// Nota: o lint irmão (unused_index) vai marcar parte destes como "não usados"
// enquanto a base for pequena (planner prefere seq scan em tabela minúscula)
// — esperado e ignorável; eles pagam quando o volume crescer.

const INDICES = [
  ['cartao_casa_visibilidade', 'casa_id'],
  ['cartoes_contas', 'conta_debito_id'],
  ['cartoes_contas', 'titular_id'],
  ['casa_pessoas', 'pessoa_id'],
  ['compras', 'cartao_conta_id'],
  ['compras', 'casa_id'],
  ['compras', 'categoria_id'],
  ['compras', 'forma_pagamento_id'],
  ['compras', 'lancado_por_id'],
  ['compras', 'pessoa_id'],
  ['convites', 'casa_id'],
  ['convites', 'convidado_por_id'],
  ['despesa_fixa_excecoes', 'lancado_por_id'],
  ['despesas_fixas', 'cartao_conta_padrao_id'],
  ['despesas_fixas', 'categoria_id'],
  ['despesas_fixas', 'despesa_fixa_anterior_id'],
  ['despesas_fixas', 'lancado_por_id'],
  ['metas', 'casa_id'],
  ['metas', 'pessoa_id'],
  ['percentuais_custeio', 'pessoa_id'],
  ['receita_fixa_excecoes', 'lancado_por_id'],
  ['receitas', 'casa_id'],
  ['receitas', 'conta_destino_id'],
  ['receitas', 'lancado_por_id'],
  ['receitas', 'origem_id'],
  ['receitas', 'pessoa_id'],
  ['receitas_fixas', 'conta_destino_id'],
  ['receitas_fixas', 'lancado_por_id'],
  ['receitas_fixas', 'origem_id'],
  ['receitas_fixas', 'receita_fixa_anterior_id'],
];

exports.up = (pgm) => {
  for (const [tabela, coluna] of INDICES) {
    pgm.createIndex(tabela, coluna);
  }
};

exports.down = (pgm) => {
  for (const [tabela, coluna] of [...INDICES].reverse()) {
    pgm.dropIndex(tabela, coluna);
  }
};

// PIX vs dinheiro na projeção de saldo: PIX sai de uma conta corrente real —
// lançamento PIX sem cartao_conta_id é lacuna de preenchimento, não ausência
// legítima. Dinheiro físico é a única categoria genuinamente sem conta
// rastreável (fica fora da projeção). A distinção mora no catálogo curado
// (formas_pagamento), sem enum novo: forma com exige_conta = true rejeita
// compra sem cartao_conta_id.

exports.up = (pgm) => {
  pgm.addColumns('formas_pagamento', {
    exige_conta: { type: 'boolean', notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('formas_pagamento', ['exige_conta']);
};

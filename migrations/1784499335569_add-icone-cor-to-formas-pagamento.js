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

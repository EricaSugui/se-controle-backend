exports.up = (pgm) => {
  pgm.addColumns('categorias', {
    icone: { type: 'text', notNull: true, default: 'dots-horizontal-circle-outline' },
    cor: { type: 'text', notNull: true, default: '#9E9E9E' },
  });

  pgm.addConstraint('categorias', 'categorias_cor_hex_check', "CHECK (cor ~ '^#[0-9A-Fa-f]{6}$')");

  pgm.sql(`
    UPDATE categorias SET icone = dados.icone, cor = dados.cor
    FROM (VALUES
      ('Alimentação', 'food', '#FF7043'),
      ('Assinaturas e serviços digitais', 'credit-card-sync-outline', '#5C6BC0'),
      ('Compras pessoais', 'shopping-outline', '#EC407A'),
      ('Cuidados pessoais', 'spa-outline', '#AB47BC'),
      ('Dívidas e financiamentos', 'hand-coin-outline', '#8D6E63'),
      ('Educação', 'school-outline', '#42A5F5'),
      ('Filhos e dependentes', 'human-male-child', '#26A69A'),
      ('Impostos e taxas', 'file-document-outline', '#78909C'),
      ('Lazer e entretenimento', 'movie-open-outline', '#FFA726'),
      ('Moradia', 'home-outline', '#66BB6A'),
      ('Outros', 'dots-horizontal-circle-outline', '#9E9E9E'),
      ('Pets', 'paw-outline', '#8D6E63'),
      ('Presentes e doações', 'gift-outline', '#EF5350'),
      ('Saúde', 'medical-bag', '#EF5350'),
      ('Transporte', 'car-outline', '#29B6F6')
    ) AS dados(nome, icone, cor)
    WHERE categorias.nome = dados.nome
  `);
};

exports.down = (pgm) => {
  pgm.dropConstraint('categorias', 'categorias_cor_hex_check');
  pgm.dropColumns('categorias', ['icone', 'cor']);
};

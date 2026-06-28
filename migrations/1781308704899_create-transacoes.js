exports.up = (pgm) => {
  pgm.createTable('transacoes', {
    id: 'id',
    data: { type: 'date', notNull: true },
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'RESTRICT' },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    categoria_id: { type: 'integer', notNull: true, references: 'categorias', onDelete: 'RESTRICT' },
    descricao: { type: 'varchar(255)' },
    cartao_conta_id: { type: 'integer', references: 'cartoes_contas', onDelete: 'SET NULL' },
    forma_pagamento_id: { type: 'integer', references: 'formas_pagamento', onDelete: 'SET NULL' },
    parcela_atual: { type: 'smallint' },
    total_parcelas: { type: 'smallint' },
    valor_parcela: { type: 'numeric(12,2)', notNull: true },
    competencia: { type: 'varchar(10)', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.createIndex('transacoes', 'competencia');
};

exports.down = (pgm) => {
  pgm.dropTable('transacoes');
};

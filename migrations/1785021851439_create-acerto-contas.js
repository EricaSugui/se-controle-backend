// Acerto de contas (docs/acerto-contas.md): eixo do acerto com precedência
// casa → compra, e a tabela de pagamentos/adiantamentos entre pessoas.
// O eixo muda o QUANDO uma compra entra no acerto, nunca o quanto — por isso
// default na casa e override opcional por compra podem coexistir.

exports.up = (pgm) => {
  pgm.addColumns('casas', {
    acerto_eixo: {
      type: 'varchar(12)',
      notNull: true,
      default: 'competencia',
      check: "acerto_eixo IN ('competencia', 'caixa')",
    },
  });

  pgm.addColumns('compras', {
    acerto_eixo: {
      type: 'varchar(12)',
      check: "acerto_eixo IS NULL OR acerto_eixo IN ('competencia', 'caixa')",
    },
  });

  pgm.createTable('acerto_pagamentos', {
    id: 'id',
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'RESTRICT' },
    de_pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    para_pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    valor: { type: 'numeric(12,2)', notNull: true, check: 'valor > 0' },
    data: { type: 'date', notNull: true },
    observacao: { type: 'varchar(255)' },
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'acerto_pagamentos',
    'acerto_pagamentos_pessoas_distintas',
    'CHECK (de_pessoa_id <> para_pessoa_id)'
  );
  pgm.createIndex('acerto_pagamentos', 'casa_id');
  pgm.createIndex('acerto_pagamentos', 'de_pessoa_id');
  pgm.createIndex('acerto_pagamentos', 'para_pessoa_id');
  pgm.createIndex('acerto_pagamentos', 'lancado_por_id');

  pgm.sql('ALTER TABLE acerto_pagamentos ENABLE ROW LEVEL SECURITY;');
  pgm.sql(`
    CREATE POLICY acerto_pagamentos_select ON acerto_pagamentos
      FOR SELECT TO authenticated
      USING (private.participa_casa(casa_id));

    CREATE POLICY acerto_pagamentos_insert ON acerto_pagamentos
      FOR INSERT TO authenticated
      WITH CHECK (private.participa_casa(casa_id));

    CREATE POLICY acerto_pagamentos_update ON acerto_pagamentos
      FOR UPDATE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id))
      WITH CHECK (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id));

    CREATE POLICY acerto_pagamentos_delete ON acerto_pagamentos
      FOR DELETE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS acerto_pagamentos_delete ON acerto_pagamentos;
    DROP POLICY IF EXISTS acerto_pagamentos_update ON acerto_pagamentos;
    DROP POLICY IF EXISTS acerto_pagamentos_insert ON acerto_pagamentos;
    DROP POLICY IF EXISTS acerto_pagamentos_select ON acerto_pagamentos;
  `);
  pgm.dropTable('acerto_pagamentos');
  pgm.dropColumns('compras', ['acerto_eixo']);
  pgm.dropColumns('casas', ['acerto_eixo']);
};

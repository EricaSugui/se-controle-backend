exports.up = (pgm) => {
  pgm.createTable('acertos', {
    id: 'id',
    casa_id: { type: 'integer', notNull: true, references: 'casas', onDelete: 'RESTRICT' },
    confirmado_por_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    confirmado_em: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    moeda: { type: 'varchar(3)', notNull: true, default: 'BRL' },
    precisao_moeda: { type: 'smallint', notNull: true, default: 2 },
    nome_casa_snapshot: { type: 'varchar(100)', notNull: true },
    nome_arquivo_base: { type: 'varchar(180)', notNull: true },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });
  pgm.addConstraint('acertos', 'acertos_moeda_formato', "CHECK (moeda ~ '^[A-Z]{3}$')");
  pgm.addConstraint('acertos', 'acertos_precisao_moeda_valida', 'CHECK (precisao_moeda BETWEEN 0 AND 6)');
  pgm.createIndex('acertos', ['casa_id', 'confirmado_em']);

  pgm.createTable('acerto_participantes', {
    id: 'id',
    acerto_id: { type: 'integer', notNull: true, references: 'acertos', onDelete: 'CASCADE' },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    nome_snapshot: { type: 'varchar(100)', notNull: true },
    devido: { type: 'numeric(14, 2)', notNull: true },
    desembolsado: { type: 'numeric(14, 2)', notNull: true },
    pagamentos_enviados: { type: 'numeric(14, 2)', notNull: true },
    pagamentos_recebidos: { type: 'numeric(14, 2)', notNull: true },
    saldo: { type: 'numeric(14, 2)', notNull: true },
  });
  pgm.addConstraint(
    'acerto_participantes',
    'acerto_participantes_unicos',
    'UNIQUE (acerto_id, pessoa_id)'
  );
  pgm.createIndex('acerto_participantes', 'acerto_id');

  pgm.createTable('acerto_meses', {
    id: 'id',
    acerto_id: { type: 'integer', notNull: true, references: 'acertos', onDelete: 'CASCADE' },
    mes: { type: 'varchar(6)', notNull: true },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    nome_snapshot: { type: 'varchar(100)', notNull: true },
    devido: { type: 'numeric(14, 2)', notNull: true },
    desembolsado: { type: 'numeric(14, 2)', notNull: true },
    acerto: { type: 'numeric(14, 2)', notNull: true },
  });
  pgm.addConstraint(
    'acerto_meses',
    'acerto_meses_unicos',
    'UNIQUE (acerto_id, mes, pessoa_id)'
  );
  pgm.createIndex('acerto_meses', 'acerto_id');

  pgm.createTable('acerto_despesas', {
    id: 'id',
    acerto_id: { type: 'integer', notNull: true, references: 'acertos', onDelete: 'CASCADE' },
    origem_id: { type: 'integer' },
    descricao_snapshot: { type: 'varchar(255)', notNull: true },
    data: { type: 'date', notNull: true },
    competencia: { type: 'varchar(6)', notNull: true },
    valor: { type: 'numeric(14, 2)', notNull: true },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    nome_pessoa_snapshot: { type: 'varchar(100)', notNull: true },
    categoria_nome_snapshot: { type: 'varchar(100)' },
    modo_acerto: { type: 'varchar(12)', notNull: true },
  });
  pgm.addConstraint(
    'acerto_despesas',
    'acerto_despesas_modo_acerto_valido',
    "CHECK (modo_acerto IN ('competencia', 'caixa'))"
  );
  pgm.createIndex('acerto_despesas', 'acerto_id');

  pgm.createTable('acerto_transferencias', {
    id: 'id',
    acerto_id: { type: 'integer', notNull: true, references: 'acertos', onDelete: 'CASCADE' },
    origem_pagamento_id: { type: 'integer' },
    de_pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    de_nome_snapshot: { type: 'varchar(100)', notNull: true },
    para_pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    para_nome_snapshot: { type: 'varchar(100)', notNull: true },
    valor: { type: 'numeric(14, 2)', notNull: true },
    data: { type: 'date', notNull: true },
    observacao: { type: 'varchar(255)' },
  });
  pgm.addConstraint(
    'acerto_transferencias',
    'acerto_transferencias_pessoas_distintas',
    'CHECK (de_pessoa_id <> para_pessoa_id)'
  );
  pgm.createIndex('acerto_transferencias', 'acerto_id');

  pgm.createTable('acerto_eventos', {
    id: 'id',
    acerto_id: { type: 'integer', notNull: true, references: 'acertos', onDelete: 'CASCADE' },
    tipo: { type: 'varchar(20)', notNull: true },
    pessoa_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    metadados: { type: 'jsonb' },
  });
  pgm.addConstraint(
    'acerto_eventos',
    'acerto_eventos_tipo_valido',
    "CHECK (tipo IN ('confirmado', 'pdf_gerado', 'csv_gerado', 'compartilhado'))"
  );
  pgm.createIndex('acerto_eventos', 'acerto_id');

  pgm.createTable('acerto_arquivos', {
    id: 'id',
    acerto_id: { type: 'integer', notNull: true, references: 'acertos', onDelete: 'CASCADE' },
    formato: { type: 'varchar(3)', notNull: true },
    nome_arquivo: { type: 'varchar(220)', notNull: true },
    mime_type: { type: 'varchar(100)', notNull: true },
    storage_key: { type: 'varchar(500)' },
    gerado_em: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
    gerado_por_id: { type: 'integer', notNull: true, references: 'pessoas', onDelete: 'RESTRICT' },
    status: { type: 'varchar(12)', notNull: true },
    erro: { type: 'text' },
  });
  pgm.addConstraint(
    'acerto_arquivos',
    'acerto_arquivos_formato_valido',
    "CHECK (formato IN ('pdf', 'csv'))"
  );
  pgm.addConstraint(
    'acerto_arquivos',
    'acerto_arquivos_status_valido',
    "CHECK (status IN ('gerando', 'disponivel', 'erro'))"
  );
  pgm.createIndex('acerto_arquivos', ['acerto_id', 'formato']);

  for (const table of [
    'acertos',
    'acerto_participantes',
    'acerto_meses',
    'acerto_despesas',
    'acerto_transferencias',
    'acerto_eventos',
    'acerto_arquivos',
  ]) {
    pgm.sql(`ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;`);
  }

  pgm.sql(`
    CREATE POLICY acertos_select_membros ON acertos
      FOR SELECT TO authenticated
      USING (private.participa_casa(casa_id));
    CREATE POLICY acertos_insert_membros ON acertos
      FOR INSERT TO authenticated
      WITH CHECK (private.participa_casa(casa_id));

    CREATE POLICY acerto_participantes_select_membros ON acerto_participantes
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM acertos a
        WHERE a.id = acerto_participantes.acerto_id
          AND private.participa_casa(a.casa_id)
      ));
    CREATE POLICY acerto_meses_select_membros ON acerto_meses
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM acertos a
        WHERE a.id = acerto_meses.acerto_id
          AND private.participa_casa(a.casa_id)
      ));
    CREATE POLICY acerto_despesas_select_membros ON acerto_despesas
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM acertos a
        WHERE a.id = acerto_despesas.acerto_id
          AND private.participa_casa(a.casa_id)
      ));
    CREATE POLICY acerto_transferencias_select_membros ON acerto_transferencias
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM acertos a
        WHERE a.id = acerto_transferencias.acerto_id
          AND private.participa_casa(a.casa_id)
      ));
    CREATE POLICY acerto_eventos_select_membros ON acerto_eventos
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM acertos a
        WHERE a.id = acerto_eventos.acerto_id
          AND private.participa_casa(a.casa_id)
      ));
    CREATE POLICY acerto_arquivos_select_membros ON acerto_arquivos
      FOR SELECT TO authenticated
      USING (EXISTS (
        SELECT 1 FROM acertos a
        WHERE a.id = acerto_arquivos.acerto_id
          AND private.participa_casa(a.casa_id)
      ));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS acerto_arquivos_select_membros ON acerto_arquivos;
    DROP POLICY IF EXISTS acerto_eventos_select_membros ON acerto_eventos;
    DROP POLICY IF EXISTS acerto_transferencias_select_membros ON acerto_transferencias;
    DROP POLICY IF EXISTS acerto_despesas_select_membros ON acerto_despesas;
    DROP POLICY IF EXISTS acerto_meses_select_membros ON acerto_meses;
    DROP POLICY IF EXISTS acerto_participantes_select_membros ON acerto_participantes;
    DROP POLICY IF EXISTS acertos_insert_membros ON acertos;
    DROP POLICY IF EXISTS acertos_select_membros ON acertos;
  `);
  pgm.dropTable('acerto_arquivos');
  pgm.dropTable('acerto_eventos');
  pgm.dropTable('acerto_transferencias');
  pgm.dropTable('acerto_despesas');
  pgm.dropTable('acerto_meses');
  pgm.dropTable('acerto_participantes');
  pgm.dropTable('acertos');
};

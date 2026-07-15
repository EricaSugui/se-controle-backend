// Exceção = desvio pontual de uma competência de despesa fixa vigente, sem
// versionar o contrato (versionamento via despesa_fixa_anterior_id é para
// mudança permanente). Caso principal: silenciar gap legítimo (isenção,
// carência) — competência esperada que não terá lançamento vira 'justificado'
// no status. Caso secundário: anotar desvio de valor de ocorrência paga.
//
// Decisão de design: tabelas irmãs (despesa_fixa_excecoes /
// receita_fixa_excecoes), NÃO uma tabela genérica — FK direta NOT NULL é mais
// forte que duas FKs nullable + CHECK, e evita acoplar dois domínios que já
// divergiram semanticamente (vencimento vs expectativa, atraso vs
// interrupção). Visão unificada futura, se necessária: VIEW com UNION.

exports.up = (pgm) => {
  pgm.createTable('despesa_fixa_excecoes', {
    id: 'id',
    despesa_fixa_id: { type: 'integer', notNull: true, references: 'despesas_fixas', onDelete: 'RESTRICT' },
    competencia_referencia: { type: 'varchar(10)', notNull: true },
    valor_ocorrido: { type: 'numeric(12,2)' },
    // snapshot do valor_referencia do pai no momento do registro — auditoria,
    // evita reconstruir o valor esperado retroativamente; preenchido pelo backend
    valor_esperado_original: { type: 'numeric(12,2)' },
    motivo: { type: 'varchar(255)' },
    lancado_por_id: { type: 'integer', references: 'pessoas', onDelete: 'RESTRICT' },
    created_at: { type: 'timestamp', notNull: true, default: pgm.func('now()') },
  });

  pgm.addConstraint(
    'despesa_fixa_excecoes',
    'despesa_fixa_excecoes_competencia_unique',
    'UNIQUE (despesa_fixa_id, competencia_referencia)'
  );

  pgm.sql('ALTER TABLE despesa_fixa_excecoes ENABLE ROW LEVEL SECURITY;');
};

exports.down = (pgm) => {
  pgm.dropTable('despesa_fixa_excecoes');
};

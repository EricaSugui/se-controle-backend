exports.up = (pgm) => {
  // Impede duplicidade tambem quando duas requisicoes chegam ao mesmo tempo.
  // Indices separados preservam a semantica de casa_id nulo do auto-cadastro.
  pgm.sql(`
    CREATE UNIQUE INDEX convites_pendentes_email_casa_unico
      ON convites (LOWER(email), casa_id)
      WHERE status = 'pendente' AND casa_id IS NOT NULL;

    CREATE UNIQUE INDEX convites_pendentes_email_sem_casa_unico
      ON convites (LOWER(email))
      WHERE status = 'pendente' AND casa_id IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS convites_pendentes_email_casa_unico;
    DROP INDEX IF EXISTS convites_pendentes_email_sem_casa_unico;
  `);
};

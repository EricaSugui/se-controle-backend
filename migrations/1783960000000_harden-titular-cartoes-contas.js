// Saneamento estrutural pré-saldo projetado: cartão/conta sem titular quebra
// a agregação de saldo por conta e a RLS de faturas (cc.titular_id =
// pessoa_id() nunca bate com NULL). Os registros órfãos do ambiente foram
// tratados antes desta migration (data-fix pontual).

exports.up = (pgm) => {
  pgm.alterColumn('cartoes_contas', 'titular_id', { notNull: true });
  pgm.sql(`
    ALTER TABLE cartoes_contas DROP CONSTRAINT cartoes_contas_titular_id_fkey;
    ALTER TABLE cartoes_contas ADD CONSTRAINT cartoes_contas_titular_id_fkey
      FOREIGN KEY (titular_id) REFERENCES pessoas(id) ON DELETE RESTRICT;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE cartoes_contas DROP CONSTRAINT cartoes_contas_titular_id_fkey;
    ALTER TABLE cartoes_contas ADD CONSTRAINT cartoes_contas_titular_id_fkey
      FOREIGN KEY (titular_id) REFERENCES pessoas(id) ON DELETE SET NULL;
  `);
  pgm.alterColumn('cartoes_contas', 'titular_id', { notNull: false });
};

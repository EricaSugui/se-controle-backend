// Padrão de metas (1783556621920): leitura para membro da casa (ou dono, se
// pessoal); escrita só para admin da casa (ou dono). Sem policy de DELETE —
// o ciclo de vida é encerramento por vigência, nunca delete físico.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY despesas_fixas_select ON despesas_fixas FOR SELECT TO authenticated
      USING (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.participa_casa(casa_id))
      );

    CREATE POLICY despesas_fixas_insert ON despesas_fixas FOR INSERT TO authenticated
      WITH CHECK (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      );

    CREATE POLICY despesas_fixas_update ON despesas_fixas FOR UPDATE TO authenticated
      USING (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      )
      WITH CHECK (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS despesas_fixas_update ON despesas_fixas;
    DROP POLICY IF EXISTS despesas_fixas_insert ON despesas_fixas;
    DROP POLICY IF EXISTS despesas_fixas_select ON despesas_fixas;
  `);
};

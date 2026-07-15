// Padrão de metas/despesas_fixas: leitura para membro da casa (ou dono, se
// pessoal); escrita só para admin da casa (ou dono). Sem policy de DELETE —
// o ciclo de vida é encerramento por vigência, nunca delete físico.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY receitas_fixas_select ON receitas_fixas FOR SELECT TO authenticated
      USING (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.participa_casa(casa_id))
      );

    CREATE POLICY receitas_fixas_insert ON receitas_fixas FOR INSERT TO authenticated
      WITH CHECK (
        (pessoa_id IS NOT NULL AND pessoa_id = private.pessoa_id())
        OR (casa_id IS NOT NULL AND private.admin_casa(casa_id))
      );

    CREATE POLICY receitas_fixas_update ON receitas_fixas FOR UPDATE TO authenticated
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
    DROP POLICY IF EXISTS receitas_fixas_update ON receitas_fixas;
    DROP POLICY IF EXISTS receitas_fixas_insert ON receitas_fixas;
    DROP POLICY IF EXISTS receitas_fixas_select ON receitas_fixas;
  `);
};

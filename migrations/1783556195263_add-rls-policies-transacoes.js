exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY transacoes_select_membros ON transacoes
      FOR SELECT TO authenticated USING (private.participa_casa(casa_id));

    CREATE POLICY transacoes_insert_membros ON transacoes
      FOR INSERT TO authenticated WITH CHECK (private.participa_casa(casa_id));

    CREATE POLICY transacoes_update_dono_ou_admin ON transacoes
      FOR UPDATE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id))
      WITH CHECK (
        private.participa_casa(casa_id)
        AND (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id))
      );

    CREATE POLICY transacoes_delete_dono_ou_admin ON transacoes
      FOR DELETE TO authenticated
      USING (lancado_por_id = private.pessoa_id() OR private.admin_casa(casa_id));

    CREATE POLICY transacao_pagadores_select ON transacao_pagadores
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM transacoes t WHERE t.id = transacao_pagadores.transacao_id AND private.participa_casa(t.casa_id)));

    CREATE POLICY transacao_pagadores_insert ON transacao_pagadores
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM transacoes t WHERE t.id = transacao_id AND private.participa_casa(t.casa_id)));

    CREATE POLICY transacao_pagadores_update ON transacao_pagadores
      FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM transacoes t WHERE t.id = transacao_pagadores.transacao_id AND (t.lancado_por_id = private.pessoa_id() OR private.admin_casa(t.casa_id))))
      WITH CHECK (EXISTS (SELECT 1 FROM transacoes t WHERE t.id = transacao_id AND (t.lancado_por_id = private.pessoa_id() OR private.admin_casa(t.casa_id))));

    CREATE POLICY transacao_pagadores_delete ON transacao_pagadores
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM transacoes t WHERE t.id = transacao_pagadores.transacao_id AND (t.lancado_por_id = private.pessoa_id() OR private.admin_casa(t.casa_id))));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS transacao_pagadores_delete ON transacao_pagadores;
    DROP POLICY IF EXISTS transacao_pagadores_update ON transacao_pagadores;
    DROP POLICY IF EXISTS transacao_pagadores_insert ON transacao_pagadores;
    DROP POLICY IF EXISTS transacao_pagadores_select ON transacao_pagadores;
    DROP POLICY IF EXISTS transacoes_delete_dono_ou_admin ON transacoes;
    DROP POLICY IF EXISTS transacoes_update_dono_ou_admin ON transacoes;
    DROP POLICY IF EXISTS transacoes_insert_membros ON transacoes;
    DROP POLICY IF EXISTS transacoes_select_membros ON transacoes;
  `);
};

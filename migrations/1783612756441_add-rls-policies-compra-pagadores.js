exports.up = (pgm) => {
  pgm.sql(`
    CREATE POLICY compra_pagadores_select ON compra_pagadores
      FOR SELECT TO authenticated
      USING (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_pagadores.compra_id AND private.participa_casa(c.casa_id)));

    CREATE POLICY compra_pagadores_insert ON compra_pagadores
      FOR INSERT TO authenticated
      WITH CHECK (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_id AND private.participa_casa(c.casa_id)));

    CREATE POLICY compra_pagadores_update ON compra_pagadores
      FOR UPDATE TO authenticated
      USING (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_pagadores.compra_id AND (c.lancado_por_id = private.pessoa_id() OR private.admin_casa(c.casa_id))))
      WITH CHECK (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_id AND (c.lancado_por_id = private.pessoa_id() OR private.admin_casa(c.casa_id))));

    CREATE POLICY compra_pagadores_delete ON compra_pagadores
      FOR DELETE TO authenticated
      USING (EXISTS (SELECT 1 FROM compras c WHERE c.id = compra_pagadores.compra_id AND (c.lancado_por_id = private.pessoa_id() OR private.admin_casa(c.casa_id))));
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP POLICY IF EXISTS compra_pagadores_delete ON compra_pagadores;
    DROP POLICY IF EXISTS compra_pagadores_update ON compra_pagadores;
    DROP POLICY IF EXISTS compra_pagadores_insert ON compra_pagadores;
    DROP POLICY IF EXISTS compra_pagadores_select ON compra_pagadores;
  `);
};

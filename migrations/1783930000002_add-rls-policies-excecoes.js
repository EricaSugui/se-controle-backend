// Permissões derivadas do pai (padrão de parcelas/faturas, que derivam de
// compras): leitura para quem lê o contrato; escrita para quem escreve nele
// (admin da casa ou dono, se pessoal). Diferente dos contratos, exceção TEM
// policy de DELETE — é anotação corrigível, não histórico financeiro.

const leitura = (tabela, fk, pai) => `
  EXISTS (
    SELECT 1 FROM ${pai} pai WHERE pai.id = ${tabela}.${fk}
      AND ((pai.pessoa_id IS NOT NULL AND pai.pessoa_id = private.pessoa_id())
        OR (pai.casa_id IS NOT NULL AND private.participa_casa(pai.casa_id)))
  )`;

const escrita = (tabela, fk, pai) => `
  EXISTS (
    SELECT 1 FROM ${pai} pai WHERE pai.id = ${tabela}.${fk}
      AND ((pai.pessoa_id IS NOT NULL AND pai.pessoa_id = private.pessoa_id())
        OR (pai.casa_id IS NOT NULL AND private.admin_casa(pai.casa_id)))
  )`;

function policies(tabela, fk, pai) {
  return `
    CREATE POLICY ${tabela}_select ON ${tabela} FOR SELECT TO authenticated
      USING (${leitura(tabela, fk, pai)});
    CREATE POLICY ${tabela}_insert ON ${tabela} FOR INSERT TO authenticated
      WITH CHECK (${escrita(tabela, fk, pai)});
    CREATE POLICY ${tabela}_update ON ${tabela} FOR UPDATE TO authenticated
      USING (${escrita(tabela, fk, pai)}) WITH CHECK (${escrita(tabela, fk, pai)});
    CREATE POLICY ${tabela}_delete ON ${tabela} FOR DELETE TO authenticated
      USING (${escrita(tabela, fk, pai)});
  `;
}

exports.up = (pgm) => {
  pgm.sql(policies('despesa_fixa_excecoes', 'despesa_fixa_id', 'despesas_fixas'));
  pgm.sql(policies('receita_fixa_excecoes', 'receita_fixa_id', 'receitas_fixas'));
};

exports.down = (pgm) => {
  for (const tabela of ['receita_fixa_excecoes', 'despesa_fixa_excecoes']) {
    pgm.sql(`
      DROP POLICY IF EXISTS ${tabela}_delete ON ${tabela};
      DROP POLICY IF EXISTS ${tabela}_update ON ${tabela};
      DROP POLICY IF EXISTS ${tabela}_insert ON ${tabela};
      DROP POLICY IF EXISTS ${tabela}_select ON ${tabela};
    `);
  }
};

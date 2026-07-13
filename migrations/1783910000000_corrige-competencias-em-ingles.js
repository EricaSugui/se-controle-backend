// Saneamento: o app gerava competências com meses em inglês (ex. AUG-26) até
// a PR #28 do se-controle-app, e o backend gravava sem validar. Converte as
// siglas divergentes para português. Idempotente — em bancos limpos é no-op.
// JAN, MAR, JUN, JUL e NOV coincidem nas duas línguas.

const DE_PARA = [
  ['FEB', 'FEV'],
  ['APR', 'ABR'],
  ['MAY', 'MAI'],
  ['AUG', 'AGO'],
  ['SEP', 'SET'],
  ['OCT', 'OUT'],
  ['DEC', 'DEZ'],
];

const ALVOS = [
  ['compras', 'competencia'],
  ['compras', 'competencia_referencia'],
  ['receitas', 'competencia'],
  ['percentuais_custeio', 'competencia'],
  ['faturas', 'mes_referencia'],
];

exports.up = (pgm) => {
  for (const [tabela, coluna] of ALVOS) {
    for (const [en, pt] of DE_PARA) {
      pgm.sql(`
        UPDATE ${tabela}
        SET ${coluna} = '${pt}' || substring(${coluna} from 4)
        WHERE ${coluna} LIKE '${en}-%';
      `);
    }
  }
};

exports.down = () => {
  // correção de dados — sem reversão
};

require('dotenv').config();
const { Client } = require('pg');

const FIXTURE_HOUSE_NAME = process.env.HML_FIXTURE_HOUSE_NAME || 'Casa Fixture HML';

function createClient() {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL é obrigatório para limpar a homologação');
  }
  return new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
}

async function idsFromQuery(client, query, values) {
  const result = await client.query(query, values);
  return result.rows.map((row) => row.id);
}

async function deleteByIds(client, table, column, ids) {
  if (ids.length > 0) {
    await client.query(`DELETE FROM "${table}" WHERE "${column}" = ANY($1::int[])`, [ids]);
  }
}

async function main() {
  const client = createClient();
  await client.connect();

  try {
    await client.query('BEGIN');
    const houses = await client.query('SELECT id FROM casas WHERE nome = $1', [FIXTURE_HOUSE_NAME]);
    if (houses.rows.length === 0) {
      await client.query('COMMIT');
      console.log(`Casa fixture "${FIXTURE_HOUSE_NAME}" não encontrada; nada para limpar.`);
      return;
    }

    const houseIds = houses.rows.map((row) => row.id);
    const cardIds = await idsFromQuery(
      client,
      'SELECT id FROM cartoes_contas WHERE titular_id IN (SELECT pessoa_id FROM casa_pessoas WHERE casa_id = ANY($1::int[]))',
      [houseIds],
    );
    const purchaseIds = await idsFromQuery(
      client,
      'SELECT id FROM compras WHERE casa_id = ANY($1::int[])',
      [houseIds],
    );
    const reportIds = await idsFromQuery(
      client,
      'SELECT id FROM acertos WHERE casa_id = ANY($1::int[])',
      [houseIds],
    );

    for (const table of ['acerto_arquivos', 'acerto_eventos', 'acerto_transferencias',
      'acerto_despesas', 'acerto_meses', 'acerto_participantes']) {
      await deleteByIds(client, table, 'acerto_id', reportIds);
    }
    await client.query('DELETE FROM acerto_ajustes WHERE casa_id = ANY($1::int[])', [houseIds]);
    await deleteByIds(client, 'acertos', 'id', reportIds);
    await client.query('DELETE FROM acerto_pagamentos WHERE casa_id = ANY($1::int[])', [houseIds]);

    await deleteByIds(client, 'parcelas', 'compra_id', purchaseIds);
    await deleteByIds(client, 'compra_pagadores', 'compra_id', purchaseIds);
    await client.query('DELETE FROM faturas WHERE cartao_conta_id = ANY($1::int[])', [cardIds]);
    await deleteByIds(client, 'compras', 'id', purchaseIds);

    const fixedExpenseIds = await idsFromQuery(
      client,
      'SELECT id FROM despesas_fixas WHERE casa_id = ANY($1::int[])',
      [houseIds],
    );
    const fixedIncomeIds = await idsFromQuery(
      client,
      'SELECT id FROM receitas_fixas WHERE casa_id = ANY($1::int[])',
      [houseIds],
    );
    await deleteByIds(client, 'despesa_fixa_excecoes', 'despesa_fixa_id', fixedExpenseIds);
    await deleteByIds(client, 'receita_fixa_excecoes', 'receita_fixa_id', fixedIncomeIds);

    for (const table of [
      'despesas_fixas',
      'receitas_fixas',
      'receitas',
      'metas',
      'convites',
      'cartao_casa_visibilidade',
    ]) {
      await client.query(`DELETE FROM "${table}" WHERE casa_id = ANY($1::int[])`, [houseIds]);
    }
    await client.query('DELETE FROM percentuais_custeio WHERE casa_id = ANY($1::int[])', [houseIds]);

    await client.query('COMMIT');
    console.log(`Limpeza concluída para ${houseIds.length} casa(s) fixture.`);
    console.log('Preservados: catálogos globais, pessoas, casas, contas/cartões e vínculos.');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});

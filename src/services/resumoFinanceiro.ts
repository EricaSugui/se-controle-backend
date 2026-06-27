import pool from '../db';

interface DashboardCasa {
  id: number;
  nome: string;
  gastos_total: number;
  percentual_custeio: number;
  minha_parte: number;
}

interface Dashboard {
  competencia: string;
  receitas_total: number;
  gastos_total: number;
  minha_parte_total: number;
  saldo: number;
  casas: DashboardCasa[];
}

export async function calcularResumo(competencia: string): Promise<Dashboard> {
  const { rows: receitasRows } = await pool.query(
    'SELECT COALESCE(SUM(valor_liquido), 0) AS total FROM receitas WHERE competencia = $1',
    [competencia]
  );
  const receitasTotal = Number(receitasRows[0].total);

  const { rows: casasRows } = await pool.query('SELECT id, nome FROM casas WHERE ativo = true ORDER BY nome');

  const { rows: gastosRows } = await pool.query(
    `SELECT casa_id, COALESCE(SUM(valor_parcela), 0) AS total
     FROM transacoes WHERE competencia = $1 GROUP BY casa_id`,
    [competencia]
  );
  const gastosPorCasa: Record<number, number> = {};
  gastosRows.forEach((row: any) => { gastosPorCasa[row.casa_id] = Number(row.total); });

  const casas: DashboardCasa[] = [];
  let gastosTotal = 0;
  let minhaParteTotal = 0;

  for (const casa of casasRows) {
    const gastosCasa = gastosPorCasa[casa.id] || 0;

    const { rows: percentualRows } = await pool.query(
      `SELECT percentual FROM percentuais_custeio
       WHERE casa_id = $1 AND competencia = $2 LIMIT 1`,
      [casa.id, competencia]
    );
    const percentual = percentualRows.length > 0 ? Number(percentualRows[0].percentual) : 100;
    const minhaParte = gastosCasa * (percentual / 100);

    casas.push({ id: casa.id, nome: casa.nome, gastos_total: gastosCasa, percentual_custeio: percentual, minha_parte: minhaParte });
    gastosTotal += gastosCasa;
    minhaParteTotal += minhaParte;
  }

  return { competencia, receitas_total: receitasTotal, gastos_total: gastosTotal, minha_parte_total: minhaParteTotal, saldo: receitasTotal - minhaParteTotal, casas };
}

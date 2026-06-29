import pool from '../db';

interface DashboardCasa {
  id: number;
  nome: string;
  receitas_total: number;
  gastos_total: number;
  saldo_casa: number;
  percentual_custeio: number;
  minha_parte: number;
}

interface Dashboard {
  competencia: string;
  minha_parte_total: number;
  casas: DashboardCasa[];
}

export async function calcularResumo(competencia: string, pessoaId: number): Promise<Dashboard> {
  const { rows: casasRows } = await pool.query(
    `SELECT c.id, c.nome FROM casas c
     JOIN casa_pessoas cp ON cp.casa_id = c.id
     WHERE c.ativo = true AND cp.pessoa_id = $1
     ORDER BY c.nome`,
    [pessoaId]
  );

  const { rows: gastosRows } = await pool.query(
    `SELECT casa_id, COALESCE(SUM(valor_parcela), 0) AS total
     FROM transacoes WHERE competencia = $1 GROUP BY casa_id`,
    [competencia]
  );
  const gastosPorCasa: Record<number, number> = {};
  gastosRows.forEach((row: any) => { gastosPorCasa[row.casa_id] = Number(row.total); });

  const { rows: receitasRows } = await pool.query(
    `SELECT casa_id, COALESCE(SUM(valor_liquido), 0) AS total
     FROM receitas WHERE competencia = $1 GROUP BY casa_id`,
    [competencia]
  );
  const receitasPorCasa: Record<number, number> = {};
  receitasRows.forEach((row: any) => { receitasPorCasa[row.casa_id] = Number(row.total); });

  const casas: DashboardCasa[] = [];
  let minhaParteTotal = 0;

  for (const casa of casasRows) {
    const gastosCasa = gastosPorCasa[casa.id] || 0;
    const receitasCasa = receitasPorCasa[casa.id] || 0;

    const { rows: percentualRows } = await pool.query(
      `SELECT percentual FROM percentuais_custeio
       WHERE casa_id = $1 AND competencia = $2 LIMIT 1`,
      [casa.id, competencia]
    );
    const percentual = percentualRows.length > 0 ? Number(percentualRows[0].percentual) : 100;
    const minhaParte = gastosCasa * (percentual / 100);

    casas.push({
      id: casa.id,
      nome: casa.nome,
      receitas_total: receitasCasa,
      gastos_total: gastosCasa,
      saldo_casa: receitasCasa - gastosCasa,
      percentual_custeio: percentual,
      minha_parte: minhaParte,
    });
    minhaParteTotal += minhaParte;
  }

  return { competencia, minha_parte_total: minhaParteTotal, casas };
}

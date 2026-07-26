import pool from '../db';
import { adicionarMesesCompetencia, competenciaParaData, dataParaCompetencia, mesesEntre } from '../utils/competencia';

// Relatório de gastos (docs/relatorio-gastos.md): a matriz mês × categoria ×
// pessoa de UMA casa. O app deriva daí as visões (por categoria, por pessoa,
// drill-down e evolução mensal) sem endpoints extras. "Pessoa" aqui é
// compras.pessoa_id (de quem é o gasto) — quem bancou é papel do acerto.

export type EixoRelatorio = 'competencia' | 'caixa';

export interface LinhaRelatorioGastos {
  mes: string; // competência MMM-AA (no eixo caixa, o mês da data_caixa)
  categoria_id: number;
  categoria_nome: string;
  categoria_icone: string;
  categoria_cor: string;
  pessoa_id: number;
  pessoa_nome: string;
  total: number;
}

export interface RelatorioGastos {
  casa_id: number;
  de: string;
  ate: string;
  eixo: EixoRelatorio;
  linhas: LinhaRelatorioGastos[];
}

export async function calcularRelatorioGastos(
  casaId: number,
  de: string,
  ate: string,
  eixo: EixoRelatorio
): Promise<RelatorioGastos> {
  let rows: any[];

  if (eixo === 'competencia') {
    // competência é varchar MMM-AA (não ordena em SQL) — o intervalo vira
    // lista explícita de competências
    const competencias: string[] = [];
    const totalMeses = mesesEntre(de, ate);
    for (let m = 0; m <= totalMeses; m++) competencias.push(adicionarMesesCompetencia(de, m));

    ({ rows } = await pool.query(
      `SELECT c.competencia AS mes, c.categoria_id, cat.nome AS categoria_nome,
              cat.icone AS categoria_icone, cat.cor AS categoria_cor,
              c.pessoa_id, p.nome AS pessoa_nome, SUM(par.valor) AS total
       FROM compras c
       JOIN parcelas par ON par.compra_id = c.id
       JOIN categorias cat ON cat.id = c.categoria_id
       JOIN pessoas p ON p.id = c.pessoa_id
       WHERE c.casa_id = $1 AND c.competencia = ANY($2)
       GROUP BY c.competencia, c.categoria_id, cat.nome, cat.icone, cat.cor, c.pessoa_id, p.nome`,
      [casaId, competencias]
    ));
  } else {
    const inicio = competenciaParaData(de);
    const fimExclusivo = competenciaParaData(adicionarMesesCompetencia(ate, 1));

    ({ rows } = await pool.query(
      `SELECT to_char(pcc.data_caixa, 'YYYY-MM-01') AS mes_iso, pcc.categoria_id,
              cat.nome AS categoria_nome, cat.icone AS categoria_icone, cat.cor AS categoria_cor,
              pcc.pessoa_id, p.nome AS pessoa_nome, SUM(pcc.valor) AS total
       FROM parcelas_com_caixa pcc
       JOIN categorias cat ON cat.id = pcc.categoria_id
       JOIN pessoas p ON p.id = pcc.pessoa_id
       WHERE pcc.casa_id = $1 AND pcc.data_caixa >= $2 AND pcc.data_caixa < $3
       GROUP BY 1, pcc.categoria_id, cat.nome, cat.icone, cat.cor, pcc.pessoa_id, p.nome`,
      [casaId, inicio, fimExclusivo]
    ));
    rows = rows.map((r) => ({ ...r, mes: dataParaCompetencia(r.mes_iso) }));
  }

  const linhas: LinhaRelatorioGastos[] = rows
    .map((r) => ({
      mes: r.mes,
      categoria_id: r.categoria_id,
      categoria_nome: r.categoria_nome,
      categoria_icone: r.categoria_icone,
      categoria_cor: r.categoria_cor,
      pessoa_id: r.pessoa_id,
      pessoa_nome: r.pessoa_nome,
      total: Math.round(Number(r.total) * 100) / 100,
    }))
    .sort(
      (a, b) =>
        competenciaParaData(a.mes).localeCompare(competenciaParaData(b.mes)) ||
        a.categoria_nome.localeCompare(b.categoria_nome) ||
        a.pessoa_nome.localeCompare(b.pessoa_nome)
    );

  return { casa_id: casaId, de, ate, eixo, linhas };
}

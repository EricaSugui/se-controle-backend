import pool from '../db';
import { adicionarMesesCompetencia, competenciaParaData, dataParaCompetencia, mesesEntre } from '../utils/competencia';
import { hojeNoFuso } from '../utils/fuso';

export type StatusDespesaFixa = 'pago' | 'em_dia' | 'vencendo_hoje' | 'em_atraso';

export interface ItemStatusDespesaFixa {
  despesa_fixa_id: number;
  descricao: string;
  casa_id: number | null;
  pessoa_id: number | null;
  categoria_id: number;
  categoria_nome: string;
  tipo_valor: string;
  valor_referencia: number;
  periodicidade: string;
  competencia: string;
  data_esperada: string;
  status: StatusDespesaFixa;
}

export const FOLGA_DIAS_PADRAO = 3;

const ORDEM_STATUS: Record<StatusDespesaFixa, number> = {
  em_atraso: 0,
  vencendo_hoje: 1,
  em_dia: 2,
  pago: 3,
};

function adicionarDias(dataISO: string, dias: number): string {
  const data = new Date(dataISO);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Data esperada de pagamento da competência: dia_esperado clampado ao último
// dia do mês (contrato com dia 31 vence em 28/29 de fevereiro).
function calcularDataEsperada(competencia: string, diaEsperado: number): string {
  const primeiroDia = competenciaParaData(competencia); // YYYY-MM-01
  const ano = parseInt(primeiroDia.slice(0, 4), 10);
  const mes = parseInt(primeiroDia.slice(5, 7), 10);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(diaEsperado, ultimoDia);
  return `${primeiroDia.slice(0, 8)}${String(dia).padStart(2, '0')}`;
}

// Gera as competências esperadas de cada despesa fixa visível (da vigência até
// hoje; mensal de 1 em 1, anual de 12 em 12 a partir do mês-âncora) e compara
// com as compras vinculadas (despesa_fixa_id + competencia_referencia).
// - com `competencia`: retorna tudo daquela competência, inclusive pagos
//   (visão de fechamento do mês)
// - sem `competencia`: retorna só o que está em aberto
export async function calcularStatusDespesasFixas(
  pessoaId: number,
  opcoes: { competencia?: string; folgaDias?: number; fusoHorario?: string } = {}
): Promise<ItemStatusDespesaFixa[]> {
  // "hoje" no fuso de quem consulta (default America/Sao_Paulo)
  const hoje = hojeNoFuso(opcoes.fusoHorario);
  const folgaDias = opcoes.folgaDias ?? FOLGA_DIAS_PADRAO;

  const { rows: despesas } = await pool.query(
    `SELECT df.id, df.casa_id, df.pessoa_id, df.categoria_id, df.descricao,
            df.tipo_valor, df.valor_referencia, df.periodicidade, df.dia_esperado,
            df.vigente_desde::text AS vigente_desde, df.vigente_ate::text AS vigente_ate,
            cat.nome AS categoria_nome
     FROM despesas_fixas df
     JOIN categorias cat ON cat.id = df.categoria_id
     WHERE (df.pessoa_id = $1
        OR df.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1))`,
    [pessoaId]
  );
  if (despesas.length === 0) return [];

  const { rows: pagas } = await pool.query(
    'SELECT DISTINCT despesa_fixa_id, competencia_referencia FROM compras WHERE despesa_fixa_id = ANY($1)',
    [despesas.map((d) => d.id)]
  );
  const pagasSet = new Set(pagas.map((p) => `${p.despesa_fixa_id}|${p.competencia_referencia}`));

  const itens: ItemStatusDespesaFixa[] = [];

  for (const despesa of despesas) {
    const competenciaInicio = dataParaCompetencia(despesa.vigente_desde);
    const fimVigencia = despesa.vigente_ate !== null && despesa.vigente_ate < hoje ? despesa.vigente_ate : hoje;
    const totalMeses = mesesEntre(competenciaInicio, dataParaCompetencia(fimVigencia));
    const passo = despesa.periodicidade === 'anual' ? 12 : 1;

    for (let meses = 0; meses <= totalMeses; meses += passo) {
      const competencia = adicionarMesesCompetencia(competenciaInicio, meses);
      if (opcoes.competencia !== undefined && competencia !== opcoes.competencia) continue;

      const paga = pagasSet.has(`${despesa.id}|${competencia}`);
      if (paga && opcoes.competencia === undefined) continue; // sem filtro: só em aberto

      const dataEsperada = calcularDataEsperada(competencia, despesa.dia_esperado);
      let status: StatusDespesaFixa;
      if (paga) status = 'pago';
      else if (hoje < dataEsperada) status = 'em_dia';
      else if (hoje <= adicionarDias(dataEsperada, folgaDias)) status = 'vencendo_hoje';
      else status = 'em_atraso';

      itens.push({
        despesa_fixa_id: despesa.id,
        descricao: despesa.descricao,
        casa_id: despesa.casa_id,
        pessoa_id: despesa.pessoa_id,
        categoria_id: despesa.categoria_id,
        categoria_nome: despesa.categoria_nome,
        tipo_valor: despesa.tipo_valor,
        valor_referencia: despesa.valor_referencia,
        periodicidade: despesa.periodicidade,
        competencia,
        data_esperada: dataEsperada,
        status,
      });
    }
  }

  itens.sort((a, b) =>
    ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]
    || a.data_esperada.localeCompare(b.data_esperada)
    || a.despesa_fixa_id - b.despesa_fixa_id
  );
  return itens;
}

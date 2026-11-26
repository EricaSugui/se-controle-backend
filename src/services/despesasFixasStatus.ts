import pool from '../db';
import { adicionarMesesCompetencia, competenciaParaData, dataParaCompetencia, mesesEntre } from '../utils/competencia';
import { hojeNoFuso } from '../utils/fuso';

// 'justificado' = competência sem lançamento mas com exceção registrada
// (isenção, carência) — resolvida com explicação, não paga.
export type StatusDespesaFixa = 'pago' | 'em_dia' | 'vencendo_hoje' | 'em_atraso' | 'justificado';

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
  // Só quando 'pago': o que foi lançado para a ocorrência (compras vinculadas).
  realizado_em: string | null; // data do lançamento mais recente
  valor_realizado: number | null; // soma das compras vinculadas
  lancamentos: number; // quantas compras vinculadas (0 se não paga)
}

export const FOLGA_DIAS_PADRAO = 3;

const ORDEM_STATUS: Record<StatusDespesaFixa, number> = {
  em_atraso: 0,
  vencendo_hoje: 1,
  em_dia: 2,
  pago: 3,
  justificado: 4,
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

  // Por ocorrência paga: data do lançamento mais recente, soma e quantidade
  // (mais de um lançamento por ocorrência é aceito: decisão em aberto 6).
  const { rows: pagas } = await pool.query(
    `SELECT c.despesa_fixa_id, c.competencia_referencia,
            MAX(c.data)::text AS realizado_em, SUM(t.total) AS valor_realizado,
            COUNT(*)::int AS lancamentos
     FROM compras c
     JOIN (SELECT compra_id, SUM(valor) AS total FROM parcelas GROUP BY compra_id) t ON t.compra_id = c.id
     WHERE c.despesa_fixa_id = ANY($1)
     GROUP BY c.despesa_fixa_id, c.competencia_referencia`,
    [despesas.map((d) => d.id)]
  );
  const pagasMap = new Map(pagas.map((p) => [`${p.despesa_fixa_id}|${p.competencia_referencia}`, p]));

  const { rows: excecoes } = await pool.query(
    'SELECT despesa_fixa_id, competencia_referencia FROM despesa_fixa_excecoes WHERE despesa_fixa_id = ANY($1)',
    [despesas.map((d) => d.id)]
  );
  const excecoesSet = new Set(excecoes.map((e) => `${e.despesa_fixa_id}|${e.competencia_referencia}`));

  const itens: ItemStatusDespesaFixa[] = [];

  for (const despesa of despesas) {
    const competenciaInicio = dataParaCompetencia(despesa.vigente_desde);
    const fimVigencia = despesa.vigente_ate !== null && despesa.vigente_ate < hoje ? despesa.vigente_ate : hoje;
    const totalMeses = mesesEntre(competenciaInicio, dataParaCompetencia(fimVigencia));
    const passo = despesa.periodicidade === 'anual' ? 12 : 1;

    for (let meses = 0; meses <= totalMeses; meses += passo) {
      const competencia = adicionarMesesCompetencia(competenciaInicio, meses);
      if (opcoes.competencia !== undefined && competencia !== opcoes.competencia) continue;

      const realizado = pagasMap.get(`${despesa.id}|${competencia}`);
      const paga = realizado !== undefined;
      const justificada = !paga && excecoesSet.has(`${despesa.id}|${competencia}`);
      // sem filtro: só em aberto — pago e justificado estão resolvidos
      if ((paga || justificada) && opcoes.competencia === undefined) continue;

      const dataEsperada = calcularDataEsperada(competencia, despesa.dia_esperado);
      let status: StatusDespesaFixa;
      if (paga) status = 'pago';
      else if (justificada) status = 'justificado';
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
        realizado_em: realizado?.realizado_em ?? null,
        valor_realizado: realizado ? Number(realizado.valor_realizado) : null,
        lancamentos: realizado?.lancamentos ?? 0,
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

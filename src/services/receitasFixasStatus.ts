import pool from '../db';
import { adicionarMesesCompetencia, competenciaParaData, dataParaCompetencia, mesesEntre } from '../utils/competencia';

// Diferente do lado das despesas (4 estados), receitas fixas usam 3:
// recebido | aguardando (ainda dentro do esperado + folga) | atrasado.
export type StatusReceitaFixa = 'recebido' | 'aguardando' | 'atrasado';

export interface ItemStatusReceitaFixa {
  receita_fixa_id: number;
  descricao: string;
  casa_id: number | null;
  pessoa_id: number | null;
  origem_id: number;
  origem_nome: string;
  tipo_confiabilidade: string;
  valor_esperado: number | null;
  periodicidade: string;
  competencia: string;
  data_esperada: string;
  status: StatusReceitaFixa;
}

export const FOLGA_DIAS_PADRAO = 3;

const ORDEM_STATUS: Record<StatusReceitaFixa, number> = {
  atrasado: 0,
  aguardando: 1,
  recebido: 2,
};

function adicionarDias(dataISO: string, dias: number): string {
  const data = new Date(dataISO);
  data.setUTCDate(data.getUTCDate() + dias);
  return data.toISOString().slice(0, 10);
}

// Data esperada de recebimento da competência: dia clampado ao último dia do
// mês (contrato com dia 31 cai em 28/29 de fevereiro).
function calcularDataEsperada(competencia: string, diaEsperado: number): string {
  const primeiroDia = competenciaParaData(competencia); // YYYY-MM-01
  const ano = parseInt(primeiroDia.slice(0, 4), 10);
  const mes = parseInt(primeiroDia.slice(5, 7), 10);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  const dia = Math.min(diaEsperado, ultimoDia);
  return `${primeiroDia.slice(0, 8)}${String(dia).padStart(2, '0')}`;
}

// Gera as competências esperadas de cada receita fixa visível (da vigência até
// hoje; mensal de 1 em 1, anual de 12 em 12 a partir do mês-âncora) e compara
// com as receitas vinculadas (receita_fixa_id + competencia_referencia).
// - com `competencia`: retorna tudo daquela competência, inclusive recebidos
// - sem `competencia`: retorna só o que está em aberto
export async function calcularStatusReceitasFixas(
  pessoaId: number,
  opcoes: { competencia?: string; folgaDias?: number } = {}
): Promise<ItemStatusReceitaFixa[]> {
  const hoje = new Date().toISOString().slice(0, 10);
  const folgaDias = opcoes.folgaDias ?? FOLGA_DIAS_PADRAO;

  const { rows: receitasFixas } = await pool.query(
    `SELECT rf.id, rf.casa_id, rf.pessoa_id, rf.origem_id, rf.descricao,
            rf.tipo_confiabilidade, rf.valor_esperado, rf.periodicidade, rf.dia_esperado_recebimento,
            rf.vigente_desde::text AS vigente_desde, rf.vigente_ate::text AS vigente_ate,
            o.nome AS origem_nome
     FROM receitas_fixas rf
     JOIN origens_receita o ON o.id = rf.origem_id
     WHERE (rf.pessoa_id = $1
        OR rf.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1))`,
    [pessoaId]
  );
  if (receitasFixas.length === 0) return [];

  const { rows: recebidas } = await pool.query(
    'SELECT DISTINCT receita_fixa_id, competencia_referencia FROM receitas WHERE receita_fixa_id = ANY($1)',
    [receitasFixas.map((r) => r.id)]
  );
  const recebidasSet = new Set(recebidas.map((r) => `${r.receita_fixa_id}|${r.competencia_referencia}`));

  const itens: ItemStatusReceitaFixa[] = [];

  for (const receitaFixa of receitasFixas) {
    const competenciaInicio = dataParaCompetencia(receitaFixa.vigente_desde);
    const fimVigencia = receitaFixa.vigente_ate !== null && receitaFixa.vigente_ate < hoje ? receitaFixa.vigente_ate : hoje;
    const totalMeses = mesesEntre(competenciaInicio, dataParaCompetencia(fimVigencia));
    const passo = receitaFixa.periodicidade === 'anual' ? 12 : 1;

    for (let meses = 0; meses <= totalMeses; meses += passo) {
      const competencia = adicionarMesesCompetencia(competenciaInicio, meses);
      if (opcoes.competencia !== undefined && competencia !== opcoes.competencia) continue;

      const recebida = recebidasSet.has(`${receitaFixa.id}|${competencia}`);
      if (recebida && opcoes.competencia === undefined) continue; // sem filtro: só em aberto

      const dataEsperada = calcularDataEsperada(competencia, receitaFixa.dia_esperado_recebimento);
      let status: StatusReceitaFixa;
      if (recebida) status = 'recebido';
      else if (hoje <= adicionarDias(dataEsperada, folgaDias)) status = 'aguardando';
      else status = 'atrasado';

      itens.push({
        receita_fixa_id: receitaFixa.id,
        descricao: receitaFixa.descricao,
        casa_id: receitaFixa.casa_id,
        pessoa_id: receitaFixa.pessoa_id,
        origem_id: receitaFixa.origem_id,
        origem_nome: receitaFixa.origem_nome,
        tipo_confiabilidade: receitaFixa.tipo_confiabilidade,
        valor_esperado: receitaFixa.valor_esperado,
        periodicidade: receitaFixa.periodicidade,
        competencia,
        data_esperada: dataEsperada,
        status,
      });
    }
  }

  itens.sort((a, b) =>
    ORDEM_STATUS[a.status] - ORDEM_STATUS[b.status]
    || a.data_esperada.localeCompare(b.data_esperada)
    || a.receita_fixa_id - b.receita_fixa_id
  );
  return itens;
}

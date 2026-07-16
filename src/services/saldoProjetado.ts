import pool from '../db';
import { adicionarMesesCompetencia, competenciaParaData, dataParaCompetencia, mesesEntre } from '../utils/competencia';
import { hojeNoFuso } from '../utils/fuso';

export type TipoEvento = 'receita' | 'receita_esperada' | 'parcela_debito' | 'fatura' | 'despesa_esperada';

export interface EventoProjecao {
  data: string;
  tipo: TipoEvento;
  descricao: string;
  valor: number; // com sinal: entradas positivas, saídas negativas
  valor_indefinido?: boolean; // receita esperada de contrato sem valor_esperado
}

export interface ContaProjetada {
  conta: { id: number; nome: string; tipo: string; titular_id: number; titular_nome: string };
  saldo_base: number | null;
  saldo_base_data: string | null;
  sem_saldo_base: boolean;
  fluxo_liquido: number;
  saldo_projetado: number | null; // null quando não há saldo_base
  eventos: EventoProjecao[];
}

export interface AvisoProjecao {
  tipo: 'cartao_sem_conta_debito' | 'despesas_fixas_sem_meio_padrao' | 'receitas_fixas_sem_conta_destino';
  mensagem: string;
  quantidade: number;
}

export interface SaldoProjetado {
  hoje: string;
  ate: string;
  contas: ContaProjetada[];
  avisos: AvisoProjecao[];
}

function ultimoDiaMesSeguinte(dataISO: string): string {
  const ano = parseInt(dataISO.slice(0, 4), 10);
  const mes = parseInt(dataISO.slice(5, 7), 10); // 1-based
  return new Date(Date.UTC(ano, mes + 1, 0)).toISOString().slice(0, 10);
}

// dia esperado clampado ao último dia do mês da competência (mesma regra dos
// services de status)
function dataEsperadaNaCompetencia(competencia: string, diaEsperado: number): string {
  const primeiroDia = competenciaParaData(competencia);
  const ano = parseInt(primeiroDia.slice(0, 4), 10);
  const mes = parseInt(primeiroDia.slice(5, 7), 10);
  const ultimoDia = new Date(Date.UTC(ano, mes, 0)).getUTCDate();
  return `${primeiroDia.slice(0, 8)}${String(Math.min(diaEsperado, ultimoDia)).padStart(2, '0')}`;
}

// Competências esperadas de um contrato dentro do horizonte da projeção —
// diferente dos services de status (que param em "hoje"), aqui o limite é a
// data `ate` do usuário, porque a projeção olha para frente.
function competenciasEsperadas(vigenteDesde: string, vigenteAte: string | null, periodicidade: string, ate: string): string[] {
  const inicio = dataParaCompetencia(vigenteDesde);
  const fimData = vigenteAte !== null && vigenteAte < ate ? vigenteAte : ate;
  const totalMeses = mesesEntre(inicio, dataParaCompetencia(fimData));
  const passo = periodicidade === 'anual' ? 12 : 1;

  const competencias: string[] = [];
  for (let meses = 0; meses <= totalMeses; meses += passo) {
    competencias.push(adicionarMesesCompetencia(inicio, meses));
  }
  return competencias;
}

export async function calcularSaldoProjetado(
  pessoaId: number,
  opcoes: { ate?: string; fusoHorario?: string } = {}
): Promise<SaldoProjetado> {
  const hoje = hojeNoFuso(opcoes.fusoHorario);
  const ate = opcoes.ate ?? ultimoDiaMesSeguinte(hoje);

  // contas no escopo: próprias, ou compartilhadas COM SALDO em casas do usuário
  const { rows: contas } = await pool.query(
    `SELECT cc.id, cc.nome, cc.tipo, cc.titular_id, p.nome AS titular_nome,
            cc.saldo_base, cc.saldo_base_data::text AS saldo_base_data
     FROM cartoes_contas cc
     JOIN pessoas p ON p.id = cc.titular_id
     WHERE cc.tipo IN ('debito', 'aplicacao') AND cc.ativo = true
       AND (cc.titular_id = $1 OR EXISTS (
         SELECT 1 FROM cartao_casa_visibilidade v
         WHERE v.cartao_id = cc.id AND v.compartilhado = true AND v.compartilha_saldo = true
           AND v.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1)
       ))
     ORDER BY cc.nome, cc.id`,
    [pessoaId]
  );

  const eventosPorConta = new Map<number, EventoProjecao[]>();
  // saldo_base vale no FIM do dia saldo_base_data: eventos contam se
  // data > início (exclusivo) e data <= ate. Sem saldo_base, projeta só os
  // fluxos a partir de hoje.
  const inicioPorConta = new Map<number, string>();
  for (const conta of contas) {
    eventosPorConta.set(conta.id, []);
    inicioPorConta.set(conta.id, conta.saldo_base_data ?? hoje);
  }
  const contaIds = contas.map((c) => c.id);

  function adicionarEvento(contaId: number, evento: EventoProjecao) {
    if (evento.data > (inicioPorConta.get(contaId) as string) && evento.data <= ate) {
      (eventosPorConta.get(contaId) as EventoProjecao[]).push(evento);
    }
  }

  if (contaIds.length > 0) {
    // + receitas lançadas com conta destino (com data; receita sem data não é posicionável no tempo)
    const { rows: receitas } = await pool.query(
      `SELECT conta_destino_id, data::text AS data, valor_liquido, observacao
       FROM receitas WHERE conta_destino_id = ANY($1) AND data IS NOT NULL AND data <= $2`,
      [contaIds, ate]
    );
    for (const r of receitas) {
      adicionarEvento(r.conta_destino_id, {
        data: r.data, tipo: 'receita', descricao: r.observacao ?? 'Receita', valor: r.valor_liquido,
      });
    }

    // - parcelas de débito direto (data_propria) de compras na conta
    const { rows: parcelas } = await pool.query(
      `SELECT cartao_conta_id, data_propria::text AS data, valor, descricao, numero_parcela
       FROM parcelas_com_caixa
       WHERE cartao_conta_id = ANY($1) AND data_propria IS NOT NULL AND data_propria <= $2`,
      [contaIds, ate]
    );
    for (const p of parcelas) {
      adicionarEvento(p.cartao_conta_id, {
        data: p.data, tipo: 'parcela_debito', descricao: p.descricao ?? `Parcela ${p.numero_parcela}`, valor: -p.valor,
      });
    }

    // - faturas a vencer de cartões cuja fatura desagua na conta
    const { rows: faturas } = await pool.query(
      `SELECT cc.conta_debito_id AS conta_id, f.data_vencimento::text AS data,
              cc.nome AS cartao_nome, f.mes_referencia, COALESCE(SUM(p.valor), 0) AS valor
       FROM faturas f
       JOIN cartoes_contas cc ON cc.id = f.cartao_conta_id
       LEFT JOIN parcelas p ON p.fatura_id = f.id
       WHERE cc.conta_debito_id = ANY($1) AND f.data_vencimento <= $2
       GROUP BY cc.conta_debito_id, f.id, f.data_vencimento, cc.nome, f.mes_referencia`,
      [contaIds, ate]
    );
    for (const f of faturas) {
      if (f.valor === 0) continue;
      adicionarEvento(f.conta_id, {
        data: f.data, tipo: 'fatura', descricao: `Fatura ${f.cartao_nome} (${f.mes_referencia})`, valor: -f.valor,
      });
    }

    // + receitas fixas esperadas (não recebidas, não justificadas) com conta destino
    const { rows: receitasFixas } = await pool.query(
      `SELECT id, conta_destino_id, descricao, valor_esperado, periodicidade, dia_esperado_recebimento,
              vigente_desde::text AS vigente_desde, vigente_ate::text AS vigente_ate
       FROM receitas_fixas WHERE conta_destino_id = ANY($1)`,
      [contaIds]
    );
    if (receitasFixas.length > 0) {
      const ids = receitasFixas.map((r) => r.id);
      const { rows: recebidas } = await pool.query(
        'SELECT DISTINCT receita_fixa_id, competencia_referencia FROM receitas WHERE receita_fixa_id = ANY($1)', [ids]
      );
      const { rows: excecoes } = await pool.query(
        'SELECT receita_fixa_id, competencia_referencia FROM receita_fixa_excecoes WHERE receita_fixa_id = ANY($1)', [ids]
      );
      const resolvidas = new Set([
        ...recebidas.map((r) => `${r.receita_fixa_id}|${r.competencia_referencia}`),
        ...excecoes.map((e) => `${e.receita_fixa_id}|${e.competencia_referencia}`),
      ]);

      for (const rf of receitasFixas) {
        for (const competencia of competenciasEsperadas(rf.vigente_desde, rf.vigente_ate, rf.periodicidade, ate)) {
          if (resolvidas.has(`${rf.id}|${competencia}`)) continue;
          adicionarEvento(rf.conta_destino_id, {
            data: dataEsperadaNaCompetencia(competencia, rf.dia_esperado_recebimento),
            tipo: 'receita_esperada',
            descricao: `${rf.descricao} (${competencia})`,
            valor: rf.valor_esperado ?? 0,
            ...(rf.valor_esperado === null ? { valor_indefinido: true } : {}),
          });
        }
      }
    }

    // - despesas fixas esperadas (não pagas, não justificadas) cujo meio padrão
    //   resolve para a conta: conta direta, ou cartão de crédito que desagua nela
    const { rows: despesasFixas } = await pool.query(
      `SELECT df.id, df.descricao, df.valor_referencia, df.periodicidade, df.dia_esperado,
              df.vigente_desde::text AS vigente_desde, df.vigente_ate::text AS vigente_ate,
              CASE WHEN meio.tipo = 'credito' THEN meio.conta_debito_id ELSE meio.id END AS conta_id
       FROM despesas_fixas df
       JOIN cartoes_contas meio ON meio.id = df.cartao_conta_padrao_id
       WHERE (CASE WHEN meio.tipo = 'credito' THEN meio.conta_debito_id ELSE meio.id END) = ANY($1)`,
      [contaIds]
    );
    if (despesasFixas.length > 0) {
      const ids = despesasFixas.map((d) => d.id);
      const { rows: pagas } = await pool.query(
        'SELECT DISTINCT despesa_fixa_id, competencia_referencia FROM compras WHERE despesa_fixa_id = ANY($1)', [ids]
      );
      const { rows: excecoes } = await pool.query(
        'SELECT despesa_fixa_id, competencia_referencia FROM despesa_fixa_excecoes WHERE despesa_fixa_id = ANY($1)', [ids]
      );
      const resolvidas = new Set([
        ...pagas.map((p) => `${p.despesa_fixa_id}|${p.competencia_referencia}`),
        ...excecoes.map((e) => `${e.despesa_fixa_id}|${e.competencia_referencia}`),
      ]);

      for (const df of despesasFixas) {
        for (const competencia of competenciasEsperadas(df.vigente_desde, df.vigente_ate, df.periodicidade, ate)) {
          if (resolvidas.has(`${df.id}|${competencia}`)) continue;
          adicionarEvento(df.conta_id, {
            data: dataEsperadaNaCompetencia(competencia, df.dia_esperado),
            tipo: 'despesa_esperada',
            descricao: `${df.descricao} (${competencia})`,
            valor: -df.valor_referencia,
          });
        }
      }
    }
  }

  const contasProjetadas: ContaProjetada[] = contas.map((conta) => {
    const eventos = (eventosPorConta.get(conta.id) as EventoProjecao[])
      .sort((a, b) => a.data.localeCompare(b.data) || a.descricao.localeCompare(b.descricao));
    const fluxoLiquido = Math.round(eventos.reduce((soma, e) => soma + e.valor, 0) * 100) / 100;
    const semSaldoBase = conta.saldo_base === null;
    return {
      conta: { id: conta.id, nome: conta.nome, tipo: conta.tipo, titular_id: conta.titular_id, titular_nome: conta.titular_nome },
      saldo_base: conta.saldo_base,
      saldo_base_data: conta.saldo_base_data,
      sem_saldo_base: semSaldoBase,
      fluxo_liquido: fluxoLiquido,
      saldo_projetado: semSaldoBase ? null : Math.round((conta.saldo_base + fluxoLiquido) * 100) / 100,
      eventos,
    };
  });

  // avisos de configuração incompleta (não bloqueiam, guiam o usuário)
  const avisos: AvisoProjecao[] = [];
  const { rows: cartoesSemConta } = await pool.query(
    `SELECT nome FROM cartoes_contas
     WHERE titular_id = $1 AND tipo = 'credito' AND ativo = true AND conta_debito_id IS NULL ORDER BY nome`,
    [pessoaId]
  );
  if (cartoesSemConta.length > 0) {
    avisos.push({
      tipo: 'cartao_sem_conta_debito',
      mensagem: `Cartões sem conta de débito vinculada (faturas fora da projeção): ${cartoesSemConta.map((c) => c.nome).join(', ')}`,
      quantidade: cartoesSemConta.length,
    });
  }

  const escopoVisivel = `(pessoa_id = $1 OR casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1))`;
  const { rows: dfSemMeio } = await pool.query(
    `SELECT count(*)::int AS n FROM despesas_fixas
     WHERE ${escopoVisivel} AND cartao_conta_padrao_id IS NULL AND (vigente_ate IS NULL OR vigente_ate >= $2)`,
    [pessoaId, hoje]
  );
  if (dfSemMeio[0].n > 0) {
    avisos.push({
      tipo: 'despesas_fixas_sem_meio_padrao',
      mensagem: `${dfSemMeio[0].n} despesa(s) fixa(s) vigente(s) sem cartão/conta padrão — fora da projeção`,
      quantidade: dfSemMeio[0].n,
    });
  }
  const { rows: rfSemConta } = await pool.query(
    `SELECT count(*)::int AS n FROM receitas_fixas
     WHERE ${escopoVisivel} AND conta_destino_id IS NULL AND (vigente_ate IS NULL OR vigente_ate >= $2)`,
    [pessoaId, hoje]
  );
  if (rfSemConta[0].n > 0) {
    avisos.push({
      tipo: 'receitas_fixas_sem_conta_destino',
      mensagem: `${rfSemConta[0].n} receita(s) fixa(s) vigente(s) sem conta destino — fora da projeção`,
      quantidade: rfSemConta[0].n,
    });
  }

  return { hoje, ate, contas: contasProjetadas, avisos };
}

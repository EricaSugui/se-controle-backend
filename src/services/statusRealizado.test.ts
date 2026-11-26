jest.mock('../db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../utils/fuso', () => ({
  hojeNoFuso: () => '2026-11-26',
}));

import pool from '../db';
import { calcularStatusDespesasFixas } from './despesasFixasStatus';
import { calcularStatusReceitasFixas } from './receitasFixasStatus';

// O status de cada ocorrência paga/recebida traz o que foi lançado (data,
// soma e quantidade), para o app mostrar "Pagamento registrado em 10/11 ·
// R$ 129,90" em vez de só "Já paga".

const query = pool.query as jest.Mock;

describe('status de despesas fixas: realizado', () => {
  beforeEach(() => query.mockReset());

  it('ocorrência paga traz data, soma e quantidade; em aberto vem zerada', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 1, casa_id: 10, pessoa_id: null, categoria_id: 3, descricao: 'Internet',
        tipo_valor: 'fixo', valor_referencia: 129.9, periodicidade: 'mensal', dia_esperado: 15,
        vigente_desde: '2026-10-01', vigente_ate: null, categoria_nome: 'Casa',
      }] })
      .mockResolvedValueOnce({ rows: [
        { despesa_fixa_id: 1, competencia_referencia: 'OUT-26', realizado_em: '2026-10-14', valor_realizado: '100.00', lancamentos: 2 },
      ] })
      .mockResolvedValueOnce({ rows: [] });

    const itens = await calcularStatusDespesasFixas(7);
    // sem competência: só o que está em aberto (NOV-26)
    expect(itens.map((i) => i.competencia)).toEqual(['NOV-26']);
    expect(itens[0]).toMatchObject({ status: 'em_atraso', realizado_em: null, valor_realizado: null, lancamentos: 0 });

    query
      .mockResolvedValueOnce({ rows: [{
        id: 1, casa_id: 10, pessoa_id: null, categoria_id: 3, descricao: 'Internet',
        tipo_valor: 'fixo', valor_referencia: 129.9, periodicidade: 'mensal', dia_esperado: 15,
        vigente_desde: '2026-10-01', vigente_ate: null, categoria_nome: 'Casa',
      }] })
      .mockResolvedValueOnce({ rows: [
        { despesa_fixa_id: 1, competencia_referencia: 'OUT-26', realizado_em: '2026-10-14', valor_realizado: '100.00', lancamentos: 2 },
      ] })
      .mockResolvedValueOnce({ rows: [] });

    const outubro = await calcularStatusDespesasFixas(7, { competencia: 'OUT-26' });
    expect(outubro).toHaveLength(1);
    expect(outubro[0]).toMatchObject({
      status: 'pago', realizado_em: '2026-10-14', valor_realizado: 100, lancamentos: 2,
    });
  });
});

describe('status de receitas fixas: realizado', () => {
  beforeEach(() => query.mockReset());

  it('ocorrência recebida traz data (pode faltar), soma e quantidade', async () => {
    query
      .mockResolvedValueOnce({ rows: [{
        id: 5, casa_id: null, pessoa_id: 2, origem_id: 4, descricao: 'Salário', origem_nome: 'Trabalho',
        tipo_confiabilidade: 'fixa', valor_esperado: 5000, periodicidade: 'mensal', dia_esperado_recebimento: 5,
        vigente_desde: '2026-11-01', vigente_ate: null,
      }] })
      .mockResolvedValueOnce({ rows: [
        { receita_fixa_id: 5, competencia_referencia: 'NOV-26', realizado_em: null, valor_realizado: '4800.00', lancamentos: 1 },
      ] })
      .mockResolvedValueOnce({ rows: [] });

    const itens = await calcularStatusReceitasFixas(2, { competencia: 'NOV-26' });
    expect(itens[0]).toMatchObject({
      status: 'recebido', realizado_em: null, valor_realizado: 4800, lancamentos: 1,
    });
  });
});

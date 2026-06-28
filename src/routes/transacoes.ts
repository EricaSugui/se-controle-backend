import { Router } from 'express';
import pool from '../db';
import { adicionarMesesCompetencia, adicionarMesesData } from '../utils/competencia';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

const INSERT_TRANSACAO = `
  INSERT INTO transacoes
    (data, casa_id, pessoa_id, lancado_por_id, categoria_id, descricao,
     cartao_conta_id, forma_pagamento_id, parcela_atual, total_parcelas, valor_parcela, competencia)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
  RETURNING *
`;

router.get('/', async (req, res, next) => {
  try {
    const { competencia } = req.query;
    const params: unknown[] = [];
    let query = 'SELECT * FROM transacoes';

    if (competencia !== undefined) {
      params.push(competencia);
      query += ' WHERE competencia = $1';
    }

    query += ' ORDER BY data DESC, id DESC';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM transacoes WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Transação não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const {
      data, casa_id, pessoa_id, lancado_por_id, categoria_id, descricao,
      cartao_conta_id, forma_pagamento_id, parcela_atual, total_parcelas,
      valor_parcela, competencia,
    } = req.body;

    if (!data || !casa_id || !pessoa_id || !categoria_id || !valor_parcela || !competencia) {
      return res.status(400).json({ erro: 'data, casa_id, pessoa_id, categoria_id, valor_parcela e competencia são obrigatórios' });
    }

    const params = [
      data, casa_id, pessoa_id, orNull(lancado_por_id), categoria_id,
      orNull(descricao), orNull(cartao_conta_id), orNull(forma_pagamento_id),
      parcela_atual || 1, orNull(total_parcelas), valor_parcela, competencia,
    ];

    const { rows } = await pool.query(INSERT_TRANSACAO, params);

    if (total_parcelas && total_parcelas > 1) {
      for (let i = 1; i < total_parcelas; i++) {
        await pool.query(INSERT_TRANSACAO, [
          adicionarMesesData(data, i), casa_id, pessoa_id, orNull(lancado_por_id), categoria_id,
          orNull(descricao), orNull(cartao_conta_id), orNull(forma_pagamento_id),
          (parcela_atual || 1) + i, total_parcelas, valor_parcela,
          adicionarMesesCompetencia(competencia, i),
        ]);
      }
    }

    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const {
      data, casa_id, pessoa_id, lancado_por_id, categoria_id, descricao,
      cartao_conta_id, forma_pagamento_id, parcela_atual, total_parcelas,
      valor_parcela, competencia,
    } = req.body;

    if (!data || !casa_id || !pessoa_id || !categoria_id || !valor_parcela || !competencia) {
      return res.status(400).json({ erro: 'data, casa_id, pessoa_id, categoria_id, valor_parcela e competencia são obrigatórios' });
    }

    const { rows } = await pool.query(
      `UPDATE transacoes
       SET data = $1, casa_id = $2, pessoa_id = $3, lancado_por_id = $4, categoria_id = $5,
           descricao = $6, cartao_conta_id = $7, forma_pagamento_id = $8, parcela_atual = $9,
           total_parcelas = $10, valor_parcela = $11, competencia = $12
       WHERE id = $13 RETURNING *`,
      [
        data, casa_id, pessoa_id, orNull(lancado_por_id), categoria_id,
        orNull(descricao), orNull(cartao_conta_id), orNull(forma_pagamento_id),
        orNull(parcela_atual), orNull(total_parcelas), valor_parcela, competencia, req.params.id,
      ]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Transação não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM transacoes WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Transação não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;

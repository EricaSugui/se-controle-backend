import { Router } from 'express';
import pool from '../db';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

router.get('/', async (req, res, next) => {
  try {
    const { competencia } = req.query;
    const params: unknown[] = [];
    let query = 'SELECT * FROM receitas';

    if (competencia !== undefined) {
      params.push(competencia);
      query += ' WHERE competencia = $1';
    }

    query += ' ORDER BY data';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM receitas WHERE id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Receita não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { casa_id, pessoa_id, lancado_por_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia } = req.body;

    if (!casa_id || valor_liquido === undefined) {
      return res.status(400).json({ erro: 'casa_id e valor_liquido são obrigatórios' });
    }

    const { rows } = await pool.query(
      `INSERT INTO receitas
         (casa_id, pessoa_id, lancado_por_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [casa_id, orNull(pessoa_id), orNull(lancado_por_id), orNull(origem_id), orNull(observacao), orNull(valor_bruto), orNull(descontos), valor_liquido, orNull(data), orNull(competencia)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { casa_id, pessoa_id, lancado_por_id, origem_id, observacao, valor_bruto, descontos, valor_liquido, data, competencia } = req.body;

    if (!casa_id || valor_liquido === undefined) {
      return res.status(400).json({ erro: 'casa_id e valor_liquido são obrigatórios' });
    }

    const { rows } = await pool.query(
      `UPDATE receitas
       SET casa_id = $1, pessoa_id = $2, lancado_por_id = $3, origem_id = $4, observacao = $5,
           valor_bruto = $6, descontos = $7, valor_liquido = $8, data = $9, competencia = $10
       WHERE id = $11 RETURNING *`,
      [casa_id, orNull(pessoa_id), orNull(lancado_por_id), orNull(origem_id), orNull(observacao), orNull(valor_bruto), orNull(descontos), valor_liquido, orNull(data), orNull(competencia), req.params.id]
    );

    if (rows.length === 0) return res.status(404).json({ erro: 'Receita não encontrada' });
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM receitas WHERE id = $1 RETURNING id', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Receita não encontrada' });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

export default router;

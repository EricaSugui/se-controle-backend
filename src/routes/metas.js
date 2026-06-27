const express = require('express');
const pool = require('../db');

const router = express.Router();

const orNull = (value) => (value === undefined ? null : value);

router.get('/', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM metas ORDER BY objetivo');
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM metas WHERE id = $1', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Meta não encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { objetivo, valor_atual, meta, falta } = req.body;

    if (!objetivo) {
      return res.status(400).json({ erro: 'objetivo é obrigatório' });
    }

    const { rows } = await pool.query(
      `INSERT INTO metas (objetivo, valor_atual, meta, falta)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [objetivo, valor_atual === undefined ? 0 : valor_atual, orNull(meta), orNull(falta)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { objetivo, valor_atual, meta, falta } = req.body;

    if (!objetivo) {
      return res.status(400).json({ erro: 'objetivo é obrigatório' });
    }

    const { rows } = await pool.query(
      `UPDATE metas SET objetivo = $1, valor_atual = $2, meta = $3, falta = $4
       WHERE id = $5 RETURNING *`,
      [objetivo, valor_atual === undefined ? 0 : valor_atual, orNull(meta), orNull(falta), req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Meta não encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('DELETE FROM metas WHERE id = $1 RETURNING id', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Meta não encontrada' });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

module.exports = router;

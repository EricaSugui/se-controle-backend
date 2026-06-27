const express = require('express');
const pool = require('../db');

const router = express.Router({ mergeParams: true });

router.get('/', async (req, res, next) => {
  try {
    const { competencia, pessoa_id } = req.query;
    const params = [req.params.casaId];
    let query = 'SELECT * FROM percentuais_custeio WHERE casa_id = $1';

    if (competencia !== undefined) {
      params.push(competencia);
      query += ` AND competencia = $${params.length}`;
    }

    if (pessoa_id !== undefined) {
      params.push(pessoa_id);
      query += ` AND pessoa_id = $${params.length}`;
    }

    query += ' ORDER BY competencia DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { pessoa_id, competencia, percentual } = req.body;

    if (!pessoa_id || !competencia || percentual === undefined) {
      return res.status(400).json({ erro: 'pessoa_id, competencia e percentual são obrigatórios' });
    }

    const { rows } = await pool.query(
      `INSERT INTO percentuais_custeio (casa_id, pessoa_id, competencia, percentual)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (casa_id, pessoa_id, competencia)
       DO UPDATE SET percentual = EXCLUDED.percentual
       RETURNING *`,
      [req.params.casaId, pessoa_id, competencia, percentual]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

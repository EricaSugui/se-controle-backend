const express = require('express');
const pool = require('../db');

const router = express.Router();

const orNull = (value) => (value === undefined ? null : value);

router.get('/', async (req, res, next) => {
  try {
    const { ativo } = req.query;
    const params = [];
    let query = 'SELECT * FROM pessoas';

    if (ativo !== undefined) {
      params.push(ativo === 'true');
      query += ' WHERE ativo = $1';
    }

    query += ' ORDER BY nome';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', async (req, res, next) => {
  try {
    const { rows } = await pool.query('SELECT * FROM pessoas WHERE id = $1', [req.params.id]);

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Pessoa não encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.post('/', async (req, res, next) => {
  try {
    const { nome, email } = req.body;

    if (!nome) {
      return res.status(400).json({ erro: 'nome é obrigatório' });
    }

    const { rows } = await pool.query(
      'INSERT INTO pessoas (nome, email) VALUES ($1, $2) RETURNING *',
      [nome, orNull(email)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { nome, email } = req.body;

    if (!nome) {
      return res.status(400).json({ erro: 'nome é obrigatório' });
    }

    const { rows } = await pool.query(
      'UPDATE pessoas SET nome = $1, email = $2 WHERE id = $3 RETURNING *',
      [nome, orNull(email), req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Pessoa não encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/ativar', (req, res, next) => setAtivo(req, res, next, true));
router.patch('/:id/desativar', (req, res, next) => setAtivo(req, res, next, false));

async function setAtivo(req, res, next, ativo) {
  try {
    const { rows } = await pool.query(
      'UPDATE pessoas SET ativo = $1 WHERE id = $2 RETURNING *',
      [ativo, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Pessoa não encontrada' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = router;

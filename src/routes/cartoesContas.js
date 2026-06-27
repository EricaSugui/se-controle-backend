const express = require('express');
const pool = require('../db');

const router = express.Router();

const orNull = (value) => (value === undefined ? null : value);

router.get('/', async (req, res, next) => {
  try {
    const { ativo } = req.query;
    const params = [];
    let query = 'SELECT * FROM cartoes_contas';

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

router.post('/', async (req, res, next) => {
  try {
    const { nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento } = req.body;

    if (!nome || !tipo) {
      return res.status(400).json({ erro: 'nome e tipo são obrigatórios' });
    }

    if (tipo !== 'credito' && tipo !== 'debito') {
      return res.status(400).json({ erro: "tipo deve ser 'credito' ou 'debito'" });
    }

    const { rows } = await pool.query(
      `INSERT INTO cartoes_contas (nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [nome, tipo, orNull(titular_id), orNull(limite), orNull(dia_fechamento), orNull(dia_vencimento)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const { nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento } = req.body;

    if (!nome || !tipo) {
      return res.status(400).json({ erro: 'nome e tipo são obrigatórios' });
    }

    if (tipo !== 'credito' && tipo !== 'debito') {
      return res.status(400).json({ erro: "tipo deve ser 'credito' ou 'debito'" });
    }

    const { rows } = await pool.query(
      `UPDATE cartoes_contas
       SET nome = $1, tipo = $2, titular_id = $3, limite = $4, dia_fechamento = $5, dia_vencimento = $6
       WHERE id = $7 RETURNING *`,
      [nome, tipo, orNull(titular_id), orNull(limite), orNull(dia_fechamento), orNull(dia_vencimento), req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Registro não encontrado' });
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
      'UPDATE cartoes_contas SET ativo = $1 WHERE id = $2 RETURNING *',
      [ativo, req.params.id]
    );

    if (rows.length === 0) {
      return res.status(404).json({ erro: 'Registro não encontrado' });
    }

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

module.exports = router;

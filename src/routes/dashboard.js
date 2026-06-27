const express = require('express');
const { calcularResumo } = require('../services/resumoFinanceiro');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { competencia } = req.query;

    if (!competencia) {
      return res.status(400).json({ erro: 'competencia é obrigatória' });
    }

    res.json(await calcularResumo(competencia));
  } catch (err) {
    next(err);
  }
});

module.exports = router;

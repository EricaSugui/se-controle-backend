const express = require('express');
const { calcularResumo } = require('../services/resumoFinanceiro');
const { adicionarMesesCompetencia, mesesEntre } = require('../utils/competencia');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { de, ate } = req.query;

    if (!de || !ate) {
      return res.status(400).json({ erro: 'de e ate são obrigatórios' });
    }

    const totalMeses = mesesEntre(de, ate);

    if (totalMeses < 0) {
      return res.status(400).json({ erro: 'de deve ser anterior ou igual a ate' });
    }

    if (totalMeses > 60) {
      return res.status(400).json({ erro: 'intervalo máximo de 60 meses' });
    }

    const meses = [];
    for (let i = 0; i <= totalMeses; i += 1) {
      meses.push(await calcularResumo(adicionarMesesCompetencia(de, i)));
    }

    res.json(meses);
  } catch (err) {
    next(err);
  }
});

module.exports = router;

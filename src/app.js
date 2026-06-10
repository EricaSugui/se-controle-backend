const express = require('express');
const cors = require('cors');

const transacoesRouter = require('./routes/transacoes');

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/transacoes', transacoesRouter);

module.exports = app;

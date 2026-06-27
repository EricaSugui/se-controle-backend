import express from 'express';
import cors from 'cors';

import transacoesRouter from './routes/transacoes';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/transacoes', transacoesRouter);

export default app;

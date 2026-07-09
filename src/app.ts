import express from 'express';
import cors from 'cors';

import pessoasRouter from './routes/pessoas';
import casasRouter from './routes/casas';
import casaPessoasRouter from './routes/casaPessoas';
import percentuaisCusteioRouter from './routes/percentuaisCusteio';
import categoriasRouter from './routes/categorias';
import formasPagamentoRouter from './routes/formasPagamento';
import cartoesContasRouter from './routes/cartoesContas';
import cartaoCasaVisibilidadeRouter from './routes/cartaoCasaVisibilidade';
import comprasRouter from './routes/compras';
import compraPagadoresRouter from './routes/compraPagadores';
import faturasRouter from './routes/faturas';
import receitasRouter from './routes/receitas';
import origensReceitaRouter from './routes/origensReceita';
import metasRouter from './routes/metas';
import dashboardRouter from './routes/dashboard';
import fechamentoMensalRouter from './routes/fechamentoMensal';
import convitesRouter from './routes/convites';
import authRouter from './routes/auth';

const app = express();

app.use(cors());
app.use(express.json());

app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

app.use('/pessoas', pessoasRouter);
app.use('/casas', casasRouter);
app.use('/casas/:casaId/pessoas', casaPessoasRouter);
app.use('/casas/:casaId/percentual-custeio', percentuaisCusteioRouter);
app.use('/categorias', categoriasRouter);
app.use('/formas-pagamento', formasPagamentoRouter);
app.use('/cartoes-contas', cartoesContasRouter);
app.use('/cartoes-contas/:cartaoId/visibilidade', cartaoCasaVisibilidadeRouter);
app.use('/compras', comprasRouter);
app.use('/compras/:compraId/pagadores', compraPagadoresRouter);
app.use('/faturas', faturasRouter);
app.use('/receitas', receitasRouter);
app.use('/origens-receita', origensReceitaRouter);
app.use('/metas', metasRouter);
app.use('/dashboard', dashboardRouter);
app.use('/fechamento-mensal', fechamentoMensalRouter);
app.use('/convites', convitesRouter);
app.use('/auth', authRouter);

app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error(err);
  res.status(500).json({ erro: 'Erro interno do servidor' });
});

export default app;

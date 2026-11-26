jest.mock('../db', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/auth', () => ({
  autenticar: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../services/relatorioAcerto', () => ({
  cancelarCompra: jest.fn(),
}));

import pool from '../db';
import comprasRouter from './compras';
import receitasRouter from './receitas';

type Handler = (req: unknown, res: any, next: jest.Mock) => Promise<void>;

// Último handler da rota GET (o primeiro é o middleware autenticar).
function getHandler(router: unknown, path: string): Handler {
  const layer = (router as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>;
  }).stack.find((item) => item.route?.path === path && item.route.methods.get);
  if (!layer?.route) throw new Error('Rota não encontrada: ' + path);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function criarRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const usuario = { id: 7 };

describe('GET /compras/caixa', () => {
  beforeEach(() => jest.clearAllMocks());

  it('vem antes de /:id (senão "caixa" seria lido como id)', () => {
    const caminhos = (comprasRouter as unknown as { stack: Array<{ route?: { path: string } }> }).stack
      .map((l) => l.route?.path)
      .filter(Boolean);
    expect(caminhos.indexOf('/caixa')).toBeGreaterThanOrEqual(0);
    expect(caminhos.indexOf('/caixa')).toBeLessThan(caminhos.indexOf('/:id'));
  });

  it('exige de e ate no formato AAAA-MM-DD', async () => {
    const handler = getHandler(comprasRouter, '/caixa');
    for (const query of [{}, { de: '2026-11-01' }, { de: '01/11/2026', ate: '2026-11-30' }]) {
      const res = criarRes();
      await handler({ query, usuario }, res, jest.fn());
      expect(res.status).toHaveBeenCalledWith(400);
    }
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('lista as parcelas do período das casas do usuário', async () => {
    const linhas = [{ parcela_id: 31, compra_id: 9, numero_parcela: 2, total_parcelas: 3, valor: 400 }];
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: linhas });
    const res = criarRes();

    await getHandler(comprasRouter, '/caixa')({ query: { de: '2026-11-01', ate: '2026-11-30' }, usuario }, res, jest.fn());

    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(params).toEqual([7, '2026-11-01', '2026-11-30']);
    expect(sql).toContain('FROM parcelas_com_caixa pc');
    expect(sql).toContain('pc.data_caixa BETWEEN $2 AND $3');
    expect(sql).toContain('SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1');
    expect(res.json).toHaveBeenCalledWith(linhas);
  });
});

describe('GET /receitas com de/ate', () => {
  beforeEach(() => jest.clearAllMocks());

  it('filtra pela data do recebimento', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    const res = criarRes();

    await getHandler(receitasRouter, '/')({ query: { de: '2026-11-01', ate: '2026-11-30' }, usuario }, res, jest.fn());

    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(params).toEqual([7, '2026-11-01', '2026-11-30']);
    expect(sql).toContain('r.data >= $2');
    expect(sql).toContain('r.data <= $3');
  });

  it('recusa data em outro formato', async () => {
    const res = criarRes();
    await getHandler(receitasRouter, '/')({ query: { de: '01/11/2026' }, usuario }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(400);
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('sem de/ate, continua como antes (só competência)', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] });
    await getHandler(receitasRouter, '/')({ query: { competencia: 'NOV-26' }, usuario }, criarRes(), jest.fn());
    const [sql, params] = (pool.query as jest.Mock).mock.calls[0];
    expect(params).toEqual([7, 'NOV-26']);
    expect(sql).not.toContain('r.data >=');
  });
});

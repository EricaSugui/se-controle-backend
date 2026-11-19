jest.mock('../db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

import pool from '../db';
import healthRouter from './health';

type Handler = (req: unknown, res: any) => Promise<void> | void;

function getHandler(path: string): Handler {
  const layer = (healthRouter as unknown as {
    stack: Array<{ route?: { path: string; stack: Array<{ handle: Handler }> } }>;
  }).stack.find((item) => item.route?.path === path);
  if (!layer?.route) throw new Error('Rota não encontrada: ' + path);
  return layer.route.stack[0].handle;
}

function criarRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

describe('health', () => {
  beforeEach(() => jest.clearAllMocks());

  it('GET /health responde ok sem consultar o banco', () => {
    const res = criarRes();
    getHandler('/')({}, res);
    expect(res.json).toHaveBeenCalledWith({ status: 'ok' });
    expect(pool.query).not.toHaveBeenCalled();
  });

  it('GET /health/db responde ok quando o banco responde', async () => {
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [{ '?column?': 1 }] });
    const res = criarRes();
    await getHandler('/db')({}, res);
    expect(pool.query).toHaveBeenCalledWith('select 1');
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ status: 'ok', banco: 'ok' });
  });

  it('GET /health/db responde 503 sem detalhes quando o banco falha', async () => {
    (pool.query as jest.Mock).mockRejectedValueOnce(new Error('senha errada para o usuário x'));
    const erro = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = criarRes();
    await getHandler('/db')({}, res);
    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({ status: 'erro', banco: 'indisponivel' });
    expect(JSON.stringify(res.json.mock.calls)).not.toContain('senha');
    erro.mockRestore();
  });
});

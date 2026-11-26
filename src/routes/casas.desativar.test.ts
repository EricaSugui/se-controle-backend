jest.mock('../db', () => ({
  __esModule: true,
  default: { query: jest.fn() },
}));

jest.mock('../middleware/auth', () => ({
  autenticar: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db';
import casasRouter from './casas';

type Handler = (req: unknown, res: any, next: jest.Mock) => Promise<void> | void;

function getHandler(path: string): Handler {
  const layer = (casasRouter as unknown as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>;
  }).stack.find((item) => item.route?.path === path && item.route.methods.patch);
  if (!layer?.route) throw new Error('Rota não encontrada: ' + path);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function criarRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const query = pool.query as jest.Mock;

describe('desativar e reativar casa', () => {
  beforeEach(() => query.mockReset());

  it('desativar expira os convites pendentes da casa', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ admin: 1 }] }) // admin da casa
      .mockResolvedValueOnce({ rows: [{ id: 3, ativo: false }] }) // desativa
      .mockResolvedValueOnce({ rows: [] }); // expira convites
    const res = criarRes();

    await getHandler('/:id/desativar')({ params: { id: '3' }, usuario: { id: 1 } }, res, jest.fn());

    const [sql, params] = query.mock.calls[2];
    expect(sql).toContain("SET status = 'expirado'");
    expect(sql).toContain("status = 'pendente'");
    expect(params).toEqual(['3']);
    expect(res.json).toHaveBeenCalledWith({ id: 3, ativo: false });
  });

  it('reativar não mexe nos convites', async () => {
    query
      .mockResolvedValueOnce({ rows: [{ admin: 1 }] })
      .mockResolvedValueOnce({ rows: [{ id: 3, ativo: true }] });

    await getHandler('/:id/ativar')({ params: { id: '3' }, usuario: { id: 1 } }, criarRes(), jest.fn());

    expect(query).toHaveBeenCalledTimes(2);
  });
});

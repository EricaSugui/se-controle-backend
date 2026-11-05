jest.mock('../db', () => ({
  __esModule: true,
  default: {
    query: jest.fn(),
    connect: jest.fn(),
  },
}));

jest.mock('../config/supabase', () => ({
  getSupabaseUser: jest.fn(),
  inviteSupabaseUser: jest.fn(),
}));

jest.mock('../middleware/auth', () => ({
  autenticar: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db';
import { getSupabaseUser } from '../config/supabase';
import convitesRouter from './convites';

describe('aceite de convite', () => {
  it('cria o onboarding com perfil de convidado na mesma transação', async () => {
    const query = pool.query as jest.Mock;
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({ rows: [{ id: 42, nome: 'Erica', email: 'erica@example.com' }] })
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({});
    const client = { query: clientQuery, release: jest.fn() };

    query
      .mockResolvedValueOnce({
        rows: [{
          id: 7,
          token: 'token',
          email: 'erica@example.com',
          status: 'pendente',
          expires_at: null,
          casa_id: 3,
          papel: 'membro',
        }],
      })
      .mockResolvedValueOnce({ rows: [] });
    (pool.connect as jest.Mock).mockResolvedValueOnce(client);
    (getSupabaseUser as jest.Mock).mockResolvedValueOnce({ id: 'auth-id', email: 'erica@example.com' });

    const layer = (convitesRouter as unknown as {
      stack: Array<{ route?: { path: string; stack: Array<{ handle: (req: unknown, res: unknown, next: jest.Mock) => Promise<void> }> } }>;
    }).stack.find((item) => item.route?.path === '/token/:token/aceitar');
    const handler = layer?.route?.stack[0]?.handle;
    if (!handler) throw new Error('Rota de aceite de convite não encontrada');

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await handler(
      {
        params: { token: 'token' },
        headers: { authorization: 'Bearer access-token' },
        body: { nome: 'Erica' },
      } as unknown,
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('INSERT INTO onboarding_pessoas'),
      [42]
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 42 }));
  });

  it('retorna erro orientativo ao convidar conta existente sem casa', async () => {
    const query = pool.query as jest.Mock;
    query
      .mockResolvedValueOnce({ rows: [{ id: 8, supabase_user_id: 'auth-existente' }] });

    const layer = (convitesRouter as unknown as {
      stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: (req: unknown, res: unknown, next: jest.Mock) => Promise<void> }> } }>;
    }).stack.find((item) => item.route?.path === '/' && item.route.methods.post);
    const handler = layer?.route?.stack[1]?.handle;
    if (!handler) throw new Error('Rota de criação de convite não encontrada');

    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    const next = jest.fn();

    await handler(
      { body: { email: 'existente@example.com' }, usuario: { id: 1 } } as unknown,
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({
      erro: 'Para convidar uma conta existente, selecione uma casa e envie o convite pela área de membros da casa',
    });
  });
});

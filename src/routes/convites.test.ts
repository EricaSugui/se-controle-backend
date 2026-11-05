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
  findSupabaseUserByEmail: jest.fn(),
}));

jest.mock('../middleware/auth', () => ({
  autenticar: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

import pool from '../db';
import {
  getSupabaseUser,
  inviteSupabaseUser,
  findSupabaseUserByEmail,
} from '../config/supabase';
import convitesRouter from './convites';

type Handler = (req: unknown, res: any, next: jest.Mock) => Promise<void>;

function getHandler(path: string, method: 'get' | 'post' | 'patch') {
  const layer = (convitesRouter as unknown as {
    stack: Array<{
      route?: {
        path: string;
        methods: Record<string, boolean>;
        stack: Array<{ handle: Handler }>;
      };
    }>;
  }).stack.find((item) => item.route?.path === path && item.route.methods[method]);

  if (!layer?.route) throw new Error('Rota não encontrada: ' + method + ' ' + path);

  const handlerLayer = layer.route.stack[layer.route.stack.length - 1];
  if (!handlerLayer) throw new Error('Handler não encontrado: ' + method + ' ' + path);
  return handlerLayer.handle;
}

function makeResponse() {
  return {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  };
}

function makeClient(query: jest.Mock) {
  const client = { query, release: jest.fn() };
  (pool.connect as jest.Mock).mockResolvedValueOnce(client);
  return client;
}

describe('criação de convites', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    process.env.FRONTEND_URL = 'https://app.example.com';
  });

  it('cria notificação interna para pessoa já vinculada a usuário', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ admin: 1 }] }) // admin da casa
      .mockResolvedValueOnce({
        rows: [{ id: 8, email: 'existente@example.com', supabase_user_id: 'auth-id' }],
      }) // pessoa pelo e-mail
      .mockResolvedValueOnce({
        rows: [{ id: 8, email: 'existente@example.com', supabase_user_id: 'auth-id' }],
      }) // pessoa pelo id Supabase
      .mockResolvedValueOnce({ rows: [] }) // ainda não é membro
      .mockResolvedValueOnce({ rows: [] }); // não há convite pendente
    (findSupabaseUserByEmail as jest.Mock).mockResolvedValueOnce({
      id: 'auth-id',
      email: 'existente@example.com',
      nome: 'Pessoa Teste',
    });

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [{ id: 8 }] }) // confirma vínculo
      .mockResolvedValueOnce({
        rows: [{
          id: 50,
          email: 'existente@example.com',
          casa_id: 3,
          tipo: 'interno',
          token: 'secret',
        }],
      }) // cria convite interno
      .mockResolvedValueOnce({}); // COMMIT
    makeClient(clientQuery);

    const res = makeResponse();
    const next = jest.fn();

    await getHandler('/', 'post')(
      {
        body: { email: 'EXISTENTE@example.com', casa_id: 3 },
        usuario: { id: 1 },
      },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 50,
      tipo: 'interno',
      interno: true,
    }));
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('token');
    expect(findSupabaseUserByEmail).toHaveBeenCalledWith('existente@example.com');
    expect(inviteSupabaseUser).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls[2][1][6]).toBe('interno');
  });

  it('localiza conta no Supabase Auth mesmo sem pessoa previamente cadastrada', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ admin: 1 }] }) // admin da casa
      .mockResolvedValueOnce({ rows: [] }); // não há pessoa com o e-mail
    (findSupabaseUserByEmail as jest.Mock).mockResolvedValueOnce({
      id: 'auth-id',
      email: 'existente@example.com',
    });
    (pool.query as jest.Mock).mockResolvedValueOnce({ rows: [] }); // pessoa pelo id Supabase

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({ rows: [] }) // nome disponível
      .mockResolvedValueOnce({ rows: [{ id: 44 }] }) // cria pessoa vinculada
      .mockResolvedValueOnce({
        rows: [{
          id: 51,
          email: 'existente@example.com',
          casa_id: 3,
          tipo: 'interno',
          token: 'secret',
        }],
      }) // cria convite interno
      .mockResolvedValueOnce({}); // COMMIT
    makeClient(clientQuery);

    const res = makeResponse();
    const next = jest.fn();

    await getHandler('/', 'post')(
      {
        body: { email: 'existente@example.com', casa_id: 3 },
        usuario: { id: 1 },
      },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(findSupabaseUserByEmail).toHaveBeenCalledWith('existente@example.com');
    expect(inviteSupabaseUser).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls[2][0]).toContain('INSERT INTO pessoas');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ interno: true }));
  });

  it('envia convite pelo Supabase quando o e-mail não pertence a um usuário', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ admin: 1 }] }) // admin da casa
      .mockResolvedValueOnce({ rows: [] }); // pessoa não encontrada
    (findSupabaseUserByEmail as jest.Mock).mockResolvedValueOnce(null);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 52,
          email: 'novo@example.com',
          casa_id: 3,
          tipo: 'email',
          destinatario_pessoa_id: null,
          token: 'token-email',
        }],
      }) // salva convite
      .mockResolvedValueOnce({}); // COMMIT
    makeClient(clientQuery);

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ nome: 'Casa' }] })
      .mockResolvedValueOnce({ rows: [{ nome: 'Convidante' }] });
    (inviteSupabaseUser as jest.Mock).mockResolvedValueOnce(undefined);

    const res = makeResponse();
    const next = jest.fn();

    await getHandler('/', 'post')(
      {
        body: { email: 'NOVO@example.com', casa_id: 3 },
        usuario: { id: 1 },
      },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(inviteSupabaseUser).toHaveBeenCalledWith(
      'novo@example.com',
      expect.stringContaining('/convidado?token='),
      expect.objectContaining({ casa_nome: 'Casa', convidado_por_nome: 'Convidante' })
    );
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json.mock.calls[0][0]).not.toHaveProperty('token');
    expect(res.json.mock.calls[0][0]).toEqual(expect.objectContaining({ tipo: 'email' }));
  });

  it('envia e-mail e preserva pessoa sem login para vinculá-la no aceite', async () => {
    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ admin: 1 }] })
      .mockResolvedValueOnce({
        rows: [{ id: 9, email: 'familiar@example.com', supabase_user_id: null }],
      })
      .mockResolvedValueOnce({ rows: [] }); // ainda não participa da casa
    (findSupabaseUserByEmail as jest.Mock).mockResolvedValueOnce(null);

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        rows: [{
          id: 53,
          email: 'familiar@example.com',
          casa_id: 3,
          tipo: 'email',
          destinatario_pessoa_id: 9,
          token: 'token-email',
        }],
      })
      .mockResolvedValueOnce({});
    makeClient(clientQuery);

    (pool.query as jest.Mock)
      .mockResolvedValueOnce({ rows: [{ nome: 'Casa' }] })
      .mockResolvedValueOnce({ rows: [{ nome: 'Convidante' }] });
    (inviteSupabaseUser as jest.Mock).mockResolvedValueOnce(undefined);

    const res = makeResponse();
    const next = jest.fn();

    await getHandler('/', 'post')(
      {
        body: { email: 'familiar@example.com', casa_id: 3 },
        usuario: { id: 1 },
      },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(inviteSupabaseUser).toHaveBeenCalled();
    expect(clientQuery.mock.calls[1][0]).toContain('destinatario_pessoa_id');
    expect(clientQuery.mock.calls[1][1][7]).toBe(9);
  });
});

describe('aceite de convite', () => {
  beforeEach(() => jest.resetAllMocks());

  it('aceita notificação interna e adiciona a pessoa à casa', async () => {
    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{ id: 7, casa_id: 3, papel: 'membro' }],
      }) // convite para esta pessoa
      .mockResolvedValueOnce({}) // associa à casa
      .mockResolvedValueOnce({
        rows: [{ id: 7, status: 'aceito', tipo: 'interno' }],
      }) // marca aceito
      .mockResolvedValueOnce({}); // COMMIT
    const client = makeClient(clientQuery);

    const res = makeResponse();
    const next = jest.fn();

    await getHandler('/recebidos/:id/aceitar', 'patch')(
      { params: { id: 7 }, usuario: { id: 8 } },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls[1][0]).toContain('destinatario_pessoa_id');
    expect(clientQuery.mock.calls[2][1]).toEqual([3, 8, 'membro']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ status: 'aceito' }));
    expect(client.release).toHaveBeenCalled();
  });

  it('vincula o login à pessoa preexistente ao aceitar convite por e-mail', async () => {
    (getSupabaseUser as jest.Mock).mockResolvedValueOnce({
      id: 'auth-id',
      email: 'familiar@example.com',
    });

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 54,
          tipo: 'email',
          status: 'pendente',
          email: 'familiar@example.com',
          casa_id: 3,
          papel: 'membro',
          destinatario_pessoa_id: 9,
        }],
      }) // convite
      .mockResolvedValueOnce({ rows: [] }) // usuário ainda não vinculado
      .mockResolvedValueOnce({
        rows: [{ id: 9, nome: 'Familiar', email: 'familiar@example.com', supabase_user_id: null }],
      }) // pessoa existente
      .mockResolvedValueOnce({
        rows: [{ id: 9, nome: 'Familiar', email: 'familiar@example.com', supabase_user_id: 'auth-id' }],
      }) // vincula conta
      .mockResolvedValueOnce({}) // associação à casa
      .mockResolvedValueOnce({}) // onboarding
      .mockResolvedValueOnce({}) // marca convite
      .mockResolvedValueOnce({}); // COMMIT
    const client = makeClient(clientQuery);

    const res = makeResponse();
    const next = jest.fn();

    await getHandler('/token/:token/aceitar', 'patch')(
      {
        params: { token: 'token-email' },
        headers: { authorization: 'Bearer access-token' },
        body: {},
      },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls[4][0]).toContain('UPDATE pessoas');
    expect(clientQuery.mock.calls[4][1]).toEqual(['auth-id', 'familiar@example.com', 9]);
    expect(clientQuery.mock.calls.some(([sql]) => String(sql).includes('INSERT INTO pessoas'))).toBe(false);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 9,
      supabase_user_id: 'auth-id',
    }));
    expect(client.release).toHaveBeenCalled();
  });

  it('cria uma pessoa nova ao aceitar convite por e-mail sem cadastro local prévio', async () => {
    (getSupabaseUser as jest.Mock).mockResolvedValueOnce({
      id: 'auth-novo',
      email: 'novo@example.com',
    });

    const clientQuery = jest.fn()
      .mockResolvedValueOnce({}) // BEGIN
      .mockResolvedValueOnce({
        rows: [{
          id: 55,
          tipo: 'email',
          status: 'pendente',
          email: 'novo@example.com',
          casa_id: 3,
          papel: 'membro',
          destinatario_pessoa_id: null,
        }],
      }) // convite
      .mockResolvedValueOnce({ rows: [] }) // usuário ainda não vinculado
      .mockResolvedValueOnce({ rows: [] }) // pessoa não existe por e-mail
      .mockResolvedValueOnce({ rows: [] }) // nome disponível
      .mockResolvedValueOnce({
        rows: [{ id: 12, nome: 'Nova Pessoa', email: 'novo@example.com', supabase_user_id: 'auth-novo' }],
      }) // cria pessoa
      .mockResolvedValueOnce({}) // associação à casa
      .mockResolvedValueOnce({}) // onboarding
      .mockResolvedValueOnce({}) // marca convite
      .mockResolvedValueOnce({}); // COMMIT
    const client = makeClient(clientQuery);

    const res = makeResponse();
    const next = jest.fn();

    await getHandler('/token/:token/aceitar', 'patch')(
      {
        params: { token: 'token-email' },
        headers: { authorization: 'Bearer access-token' },
        body: { nome: 'Nova Pessoa' },
      },
      res,
      next
    );

    expect(next).not.toHaveBeenCalled();
    expect(clientQuery.mock.calls[5][0]).toContain('INSERT INTO pessoas');
    expect(clientQuery.mock.calls[5][1]).toEqual(['Nova Pessoa', 'novo@example.com', 'auth-novo']);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      id: 12,
      supabase_user_id: 'auth-novo',
    }));
    expect(client.release).toHaveBeenCalled();
  });

});

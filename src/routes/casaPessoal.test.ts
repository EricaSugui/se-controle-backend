jest.mock('../db', () => ({
  __esModule: true,
  default: { query: jest.fn(), connect: jest.fn() },
}));

jest.mock('../middleware/auth', () => ({
  autenticar: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

jest.mock('../config/supabase', () => ({
  getSupabaseUser: jest.fn(),
  inviteSupabaseUser: jest.fn(),
  findSupabaseUserByEmail: jest.fn(),
}));

import pool from '../db';
import { garantirCasaPessoal } from '../services/casaPessoal';
import authRouter from './auth';
import casaPessoasRouter from './casaPessoas';
import casasRouter from './casas';
import convitesRouter from './convites';
import percentuaisRouter from './percentuaisCusteio';

// Casa Pessoal (espaço pessoal): criação idempotente e as ações que não se
// aplicam a ela. Especificação: se-controle-workspace,
// docs/planos/casa-pessoal-nucleo.md.

type Handler = (req: unknown, res: any, next: jest.Mock) => Promise<void> | void;
type Metodo = 'get' | 'post' | 'put' | 'patch' | 'delete';

function handler(router: unknown, path: string, metodo: Metodo): Handler {
  const layer = (router as {
    stack: Array<{ route?: { path: string; methods: Record<string, boolean>; stack: Array<{ handle: Handler }> } }>;
  }).stack.find((item) => item.route?.path === path && item.route.methods[metodo]);
  if (!layer?.route) throw new Error(`Rota não encontrada: ${metodo} ${path}`);
  return layer.route.stack[layer.route.stack.length - 1].handle;
}

function criarRes() {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

const query = pool.query as jest.Mock;
const usuario = { id: 1 };
const ADMIN = { rows: [{ admin: 1 }] };
const PESSOAL = { rows: [{ pessoal: true }] };

describe('garantirCasaPessoal', () => {
  beforeEach(() => query.mockReset());

  it('cria a Casa Pessoal e põe a dona como admin', async () => {
    query.mockResolvedValueOnce({ rows: [{ id: 42 }] }).mockResolvedValueOnce({});
    expect(await garantirCasaPessoal(pool, 7)).toBe(42);
    expect(query.mock.calls[0][0]).toContain('ON CONFLICT (dono_pessoa_id) WHERE pessoal DO NOTHING');
    expect(query.mock.calls[0][1]).toEqual(['Pessoal', 7]);
    expect(query.mock.calls[1][1]).toEqual([42, 7]);
  });

  it('não duplica: se já existe, devolve a existente', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 5 }] });
    expect(await garantirCasaPessoal(pool, 7)).toBe(5);
    expect(query).toHaveBeenCalledTimes(2);
    expect(query.mock.calls[1][0]).toContain('WHERE pessoal AND dono_pessoa_id');
  });
});

describe('ações que não se aplicam ao espaço pessoal (409)', () => {
  beforeEach(() => query.mockReset());

  it('convidar', async () => {
    query
      .mockResolvedValueOnce(ADMIN) // admin da casa
      .mockResolvedValueOnce({ rows: [{ ativo: true }] }) // casa ativa
      .mockResolvedValueOnce(PESSOAL); // espaço pessoal
    const res = criarRes();
    await handler(convitesRouter, '/', 'post')({ body: { email: 'x@example.com', casa_id: 6 }, usuario }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it.each([
    ['adicionar membro', casaPessoasRouter, '/', 'post', { body: { pessoa_id: 2 } }],
    ['mudar papel', casaPessoasRouter, '/:pessoaId/papel', 'patch', { body: { papel: 'membro' } }],
    ['remover membro', casaPessoasRouter, '/:pessoaId', 'delete', { body: {} }],
    ['definir combinado', percentuaisRouter, '/', 'post', { body: { pessoa_id: 1, competencia: 'NOV-26', percentual: 100 } }],
  ] as const)('%s', async (_nome, router, path, metodo, extra) => {
    query.mockResolvedValueOnce(ADMIN).mockResolvedValueOnce(PESSOAL);
    const res = criarRes();
    await handler(router, path, metodo)({ params: { casaId: '6', pessoaId: '1' }, usuario, ...extra }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(query).toHaveBeenCalledTimes(2); // nada foi gravado
  });

  it('editar nome ou rateio', async () => {
    query.mockResolvedValueOnce(ADMIN).mockResolvedValueOnce(PESSOAL);
    const res = criarRes();
    await handler(casasRouter, '/:id', 'put')({ params: { id: '6' }, body: { nome: 'Outro', usa_custeio: true }, usuario }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(query).toHaveBeenCalledTimes(2);
  });

  it('desativar', async () => {
    query.mockResolvedValueOnce(ADMIN).mockResolvedValueOnce(PESSOAL);
    const res = criarRes();
    await handler(casasRouter, '/:id/desativar', 'patch')({ params: { id: '6' }, usuario }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(query).toHaveBeenCalledTimes(2);
  });
});

describe('casas', () => {
  beforeEach(() => query.mockReset());

  it('"Pessoal" é nome reservado para casa compartilhada', async () => {
    const res = criarRes();
    await handler(casasRouter, '/', 'post')({ body: { nome: '  pessoal ' }, usuario }, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(409);
    expect(pool.connect).not.toHaveBeenCalled();
  });

  it('GET /casas lista só as casas de que a pessoa participa', async () => {
    query.mockResolvedValueOnce({ rows: [] });
    await handler(casasRouter, '/', 'get')({ query: { ativo: 'true' }, usuario }, criarRes(), jest.fn());
    const [sql, params] = query.mock.calls[0];
    expect(sql).toContain('SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1');
    expect(params).toEqual([1, true]);
  });
});

describe('/auth/me', () => {
  beforeEach(() => query.mockReset());

  it('garante o espaço pessoal de quem abre o app', async () => {
    query.mockResolvedValueOnce({ rows: [] }).mockResolvedValueOnce({ rows: [{ id: 6 }] });
    const res = criarRes();
    await handler(authRouter, '/me', 'get')({ usuario: { id: 1, nome: 'Erica' } }, res, jest.fn());
    expect(query.mock.calls[0][0]).toContain('INSERT INTO casas');
    expect(res.json).toHaveBeenCalledWith({ id: 1, nome: 'Erica' });
  });
});

import pool from '../db';

// Casa Pessoal (o "espaço pessoal" na interface): uma Casa só da pessoa, sem
// rateio, criada para quem tem login. Especificação: se-controle-workspace,
// docs/planos/casa-pessoal-nucleo.md. A migration 1785200000000 cria as de
// quem já tinha login; esta função cria as demais, nos pontos em que a pessoa
// passa a ter login (aceite de convite, /auth/vincular) e em /auth/me, como
// rede de segurança. Idempotente.

type Db = { query: typeof pool.query };

export const NOME_CASA_PESSOAL = 'Pessoal';
export const ERRO_CASA_PESSOAL = 'Esta ação não se aplica ao espaço pessoal';

export async function garantirCasaPessoal(db: Db, pessoaId: number): Promise<number> {
  const { rows: criada } = await db.query(
    `INSERT INTO casas (nome, pessoal, dono_pessoa_id, usa_custeio)
     VALUES ($1, true, $2, false)
     ON CONFLICT (dono_pessoa_id) WHERE pessoal DO NOTHING
     RETURNING id`,
    [NOME_CASA_PESSOAL, pessoaId]
  );
  if (criada.length > 0) {
    await db.query(
      `INSERT INTO casa_pessoas (casa_id, pessoa_id, papel) VALUES ($1, $2, 'admin')
       ON CONFLICT (casa_id, pessoa_id) DO NOTHING`,
      [criada[0].id, pessoaId]
    );
    return criada[0].id;
  }
  const { rows } = await db.query('SELECT id FROM casas WHERE pessoal AND dono_pessoa_id = $1', [pessoaId]);
  return rows[0].id;
}

export async function ehCasaPessoal(db: Db, casaId: number | string): Promise<boolean> {
  const { rows } = await db.query('SELECT pessoal FROM casas WHERE id = $1', [casaId]);
  return rows.length > 0 && rows[0].pessoal === true;
}

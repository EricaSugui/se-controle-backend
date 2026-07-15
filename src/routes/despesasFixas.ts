import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { ehCompetenciaValida } from '../utils/competencia';
import { hojeNoFuso } from '../utils/fuso';
import { ehNumeroValido } from '../utils/numero';
import { calcularStatusDespesasFixas } from '../services/despesasFixasStatus';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

const TIPOS_VALOR = ['fixo', 'variavel_estimado'];
const PERIODICIDADES = ['mensal', 'anual'];

function validarPessoaOuCasa(pessoa_id: unknown, casa_id: unknown): string | null {
  const temPessoa = pessoa_id !== undefined && pessoa_id !== null;
  const temCasa = casa_id !== undefined && casa_id !== null;
  if (temPessoa === temCasa) return 'informe exatamente um entre pessoa_id e casa_id';
  return null;
}

function ehDataValida(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !isNaN(Date.parse(valor));
}

function validarCampos(body: any): string | null {
  const { descricao, tipo_valor, valor_referencia, periodicidade, dia_esperado, vigente_desde, vigente_ate } = body;

  if (!descricao) return 'descricao é obrigatória';
  if (!TIPOS_VALOR.includes(tipo_valor)) return `tipo_valor deve ser um de: ${TIPOS_VALOR.join(', ')}`;
  if (!ehNumeroValido(valor_referencia)) return 'valor_referencia deve ser um número';
  if (!PERIODICIDADES.includes(periodicidade)) return `periodicidade deve ser uma de: ${PERIODICIDADES.join(', ')}`;
  if (!Number.isInteger(dia_esperado) || dia_esperado < 1 || dia_esperado > 31) return 'dia_esperado deve ser um inteiro entre 1 e 31';
  if (!ehDataValida(vigente_desde)) return 'vigente_desde é obrigatória (formato AAAA-MM-DD)';
  if (vigente_ate !== undefined && vigente_ate !== null) {
    if (!ehDataValida(vigente_ate)) return 'vigente_ate deve estar no formato AAAA-MM-DD';
    if (vigente_ate < vigente_desde) return 'vigente_ate deve ser maior ou igual a vigente_desde';
  }
  return null;
}

async function categoriaExiste(categoriaId: unknown): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM categorias WHERE id = $1', [categoriaId]);
  return rows.length > 0;
}

async function autorizarLeitura(pessoaId: number, casaId: number | null, donoPessoaId: number | null): Promise<boolean> {
  if (donoPessoaId !== null) return donoPessoaId === pessoaId;
  const { rows } = await pool.query('SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2', [casaId, pessoaId]);
  return rows.length > 0;
}

async function autorizarEscrita(pessoaId: number, casaId: number | null, donoPessoaId: number | null): Promise<boolean> {
  if (donoPessoaId !== null) return donoPessoaId === pessoaId;
  const { rows } = await pool.query(
    `SELECT 1 FROM casa_pessoas WHERE casa_id = $1 AND pessoa_id = $2 AND papel = 'admin'`,
    [casaId, pessoaId]
  );
  return rows.length > 0;
}

const SELECT_BASE = `
  SELECT df.*, cat.nome AS categoria_nome
  FROM despesas_fixas df
  JOIN categorias cat ON cat.id = df.categoria_id
`;

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { casa_id, pessoa_id, vigente } = req.query;

    const params: unknown[] = [pessoaId];
    let query =
      SELECT_BASE +
      ` WHERE (df.pessoa_id = $1
           OR df.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1))`;

    if (casa_id !== undefined) {
      params.push(casa_id);
      query += ` AND df.casa_id = $${params.length}`;
    }
    if (pessoa_id !== undefined) {
      params.push(pessoa_id);
      query += ` AND df.pessoa_id = $${params.length}`;
    }
    if (vigente === 'true') {
      params.push(hojeNoFuso((req as any).usuario.fuso_horario));
      query += ` AND (df.vigente_ate IS NULL OR df.vigente_ate >= $${params.length})`;
    } else if (vigente === 'false') {
      params.push(hojeNoFuso((req as any).usuario.fuso_horario));
      query += ` AND df.vigente_ate < $${params.length}`;
    }

    query += ' ORDER BY df.descricao, df.id';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

// Precisa vir antes de GET /:id — senão o Express casa "status" como :id
router.get('/status', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { competencia, folga_dias } = req.query;

    let folgaDias: number | undefined;
    if (folga_dias !== undefined) {
      folgaDias = Number(folga_dias);
      if (!Number.isInteger(folgaDias) || folgaDias < 0) {
        return res.status(400).json({ erro: 'folga_dias deve ser um inteiro maior ou igual a zero' });
      }
    }

    if (competencia !== undefined && !ehCompetenciaValida(competencia)) {
      return res.status(400).json({ erro: `competencia inválida: ${competencia}` });
    }

    const itens = await calcularStatusDespesasFixas(pessoaId, {
      competencia: competencia as string | undefined,
      folgaDias,
      fusoHorario: (req as any).usuario.fuso_horario,
    });
    res.json(itens);
  } catch (err) {
    next(err);
  }
});

router.get('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows } = await pool.query(SELECT_BASE + ' WHERE df.id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Despesa fixa não encontrada' });

    const despesa = rows[0];
    if (!(await autorizarLeitura(pessoaId, despesa.casa_id, despesa.pessoa_id))) {
      return res.status(404).json({ erro: 'Despesa fixa não encontrada' });
    }
    res.json(despesa);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const {
      casa_id, pessoa_id, categoria_id, descricao, tipo_valor, valor_referencia,
      periodicidade, dia_esperado, vigente_desde, vigente_ate, despesa_fixa_anterior_id,
    } = req.body;

    const erroXor = validarPessoaOuCasa(pessoa_id, casa_id);
    if (erroXor) return res.status(400).json({ erro: erroXor });

    const erroCampos = validarCampos(req.body);
    if (erroCampos) return res.status(400).json({ erro: erroCampos });

    if (!(await categoriaExiste(categoria_id))) {
      return res.status(400).json({ erro: 'categoria_id inválido' });
    }

    if (!(await autorizarEscrita(pessoaId, casa_id ?? null, pessoa_id ?? null))) {
      return res.status(403).json({ erro: 'Você não tem permissão para criar despesa fixa neste escopo' });
    }

    if (despesa_fixa_anterior_id !== undefined && despesa_fixa_anterior_id !== null) {
      const { rows: anteriores } = await pool.query('SELECT * FROM despesas_fixas WHERE id = $1', [despesa_fixa_anterior_id]);
      if (anteriores.length === 0) return res.status(400).json({ erro: 'despesa_fixa_anterior_id inválido' });

      const anterior = anteriores[0];
      const mesmoEscopo =
        (anterior.casa_id !== null && anterior.casa_id === (casa_id ?? null)) ||
        (anterior.pessoa_id !== null && anterior.pessoa_id === (pessoa_id ?? null));
      if (!mesmoEscopo) return res.status(400).json({ erro: 'a despesa fixa anterior deve pertencer ao mesmo escopo (mesma casa ou mesma pessoa)' });
      if (anterior.vigente_ate === null) return res.status(400).json({ erro: 'encerre a despesa fixa anterior antes de criar a nova versão' });
    }

    // lancado_por_id é sempre o usuário autenticado — nunca vem do body
    const { rows } = await pool.query(
      `INSERT INTO despesas_fixas
         (casa_id, pessoa_id, categoria_id, descricao, tipo_valor, valor_referencia,
          periodicidade, dia_esperado, vigente_desde, vigente_ate, despesa_fixa_anterior_id, lancado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        orNull(casa_id), orNull(pessoa_id), categoria_id, descricao, tipo_valor, valor_referencia,
        periodicidade, dia_esperado, vigente_desde, orNull(vigente_ate), orNull(despesa_fixa_anterior_id), pessoaId,
      ]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows: existentes } = await pool.query('SELECT * FROM despesas_fixas WHERE id = $1', [req.params.id]);
    if (existentes.length === 0) return res.status(404).json({ erro: 'Despesa fixa não encontrada' });

    const atual = existentes[0];
    if (!(await autorizarEscrita(pessoaId, atual.casa_id, atual.pessoa_id))) {
      return res.status(403).json({ erro: 'Você não tem permissão para editar esta despesa fixa' });
    }

    // casa_id/pessoa_id, despesa_fixa_anterior_id e lancado_por_id não são
    // alteráveis via PUT — escopo e sucessão são fixos desde a criação
    const { categoria_id, descricao, tipo_valor, valor_referencia, periodicidade, dia_esperado, vigente_desde, vigente_ate } = req.body;

    const erroCampos = validarCampos(req.body);
    if (erroCampos) return res.status(400).json({ erro: erroCampos });

    if (!(await categoriaExiste(categoria_id))) {
      return res.status(400).json({ erro: 'categoria_id inválido' });
    }

    const { rows } = await pool.query(
      `UPDATE despesas_fixas
       SET categoria_id = $1, descricao = $2, tipo_valor = $3, valor_referencia = $4,
           periodicidade = $5, dia_esperado = $6, vigente_desde = $7, vigente_ate = $8
       WHERE id = $9 RETURNING *`,
      [categoria_id, descricao, tipo_valor, valor_referencia, periodicidade, dia_esperado, vigente_desde, orNull(vigente_ate), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.patch('/:id/encerrar', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows: existentes } = await pool.query('SELECT * FROM despesas_fixas WHERE id = $1', [req.params.id]);
    if (existentes.length === 0) return res.status(404).json({ erro: 'Despesa fixa não encontrada' });

    const atual = existentes[0];
    if (!(await autorizarEscrita(pessoaId, atual.casa_id, atual.pessoa_id))) {
      return res.status(403).json({ erro: 'Você não tem permissão para encerrar esta despesa fixa' });
    }
    if (atual.vigente_ate !== null) return res.status(400).json({ erro: 'despesa fixa já encerrada' });

    const { vigente_ate } = req.body ?? {};
    if (vigente_ate !== undefined && vigente_ate !== null && !ehDataValida(vigente_ate)) {
      return res.status(400).json({ erro: 'vigente_ate deve estar no formato AAAA-MM-DD' });
    }

    // default: hoje no fuso de quem encerra (não o CURRENT_DATE do servidor)
    const vigenteAteEfetiva = orNull(vigente_ate) ?? hojeNoFuso((req as any).usuario.fuso_horario);
    const { rows } = await pool.query(
      'UPDATE despesas_fixas SET vigente_ate = $1 WHERE id = $2 RETURNING *',
      [vigenteAteEfetiva, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    if ((err as any).code === '23514') {
      return res.status(400).json({ erro: 'vigente_ate deve ser maior ou igual a vigente_desde' });
    }
    next(err);
  }
});

export default router;

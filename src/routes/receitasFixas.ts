import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { ehCompetenciaValida } from '../utils/competencia';
import { hojeNoFuso } from '../utils/fuso';
import { ehNumeroValido } from '../utils/numero';
import { calcularStatusReceitasFixas } from '../services/receitasFixasStatus';
import createExcecoesRouter from './excecoesFixasRouter';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

const TIPOS_CONFIABILIDADE = ['fixa', 'variavel'];
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
  const { descricao, tipo_confiabilidade, valor_esperado, periodicidade, dia_esperado_recebimento, vigente_desde, vigente_ate } = body;

  if (!descricao) return 'descricao é obrigatória';
  if (!TIPOS_CONFIABILIDADE.includes(tipo_confiabilidade)) return `tipo_confiabilidade deve ser um de: ${TIPOS_CONFIABILIDADE.join(', ')}`;
  // valor_esperado é opcional (receitas de confiabilidade variável podem não ter estimativa)
  if (valor_esperado !== undefined && valor_esperado !== null && !ehNumeroValido(valor_esperado)) return 'valor_esperado deve ser um número';
  if (!PERIODICIDADES.includes(periodicidade)) return `periodicidade deve ser uma de: ${PERIODICIDADES.join(', ')}`;
  if (!Number.isInteger(dia_esperado_recebimento) || dia_esperado_recebimento < 1 || dia_esperado_recebimento > 31) {
    return 'dia_esperado_recebimento deve ser um inteiro entre 1 e 31';
  }
  if (!ehDataValida(vigente_desde)) return 'vigente_desde é obrigatória (formato AAAA-MM-DD)';
  if (vigente_ate !== undefined && vigente_ate !== null) {
    if (!ehDataValida(vigente_ate)) return 'vigente_ate deve estar no formato AAAA-MM-DD';
    if (vigente_ate < vigente_desde) return 'vigente_ate deve ser maior ou igual a vigente_desde';
  }
  return null;
}

async function origemExiste(origemId: unknown): Promise<boolean> {
  const { rows } = await pool.query('SELECT 1 FROM origens_receita WHERE id = $1', [origemId]);
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
  SELECT rf.*, o.nome AS origem_nome
  FROM receitas_fixas rf
  JOIN origens_receita o ON o.id = rf.origem_id
`;

router.get('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { casa_id, pessoa_id, vigente } = req.query;

    const params: unknown[] = [pessoaId];
    let query =
      SELECT_BASE +
      ` WHERE (rf.pessoa_id = $1
           OR rf.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1))`;

    if (casa_id !== undefined) {
      params.push(casa_id);
      query += ` AND rf.casa_id = $${params.length}`;
    }
    if (pessoa_id !== undefined) {
      params.push(pessoa_id);
      query += ` AND rf.pessoa_id = $${params.length}`;
    }
    if (vigente === 'true') {
      params.push(hojeNoFuso((req as any).usuario.fuso_horario));
      query += ` AND (rf.vigente_ate IS NULL OR rf.vigente_ate >= $${params.length})`;
    } else if (vigente === 'false') {
      params.push(hojeNoFuso((req as any).usuario.fuso_horario));
      query += ` AND rf.vigente_ate < $${params.length}`;
    }

    query += ' ORDER BY rf.descricao, rf.id';
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

    const itens = await calcularStatusReceitasFixas(pessoaId, {
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
    const { rows } = await pool.query(SELECT_BASE + ' WHERE rf.id = $1', [req.params.id]);
    if (rows.length === 0) return res.status(404).json({ erro: 'Receita fixa não encontrada' });

    const receitaFixa = rows[0];
    if (!(await autorizarLeitura(pessoaId, receitaFixa.casa_id, receitaFixa.pessoa_id))) {
      return res.status(404).json({ erro: 'Receita fixa não encontrada' });
    }
    res.json(receitaFixa);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const {
      casa_id, pessoa_id, origem_id, descricao, tipo_confiabilidade, valor_esperado,
      periodicidade, dia_esperado_recebimento, vigente_desde, vigente_ate, receita_fixa_anterior_id,
    } = req.body;

    const erroXor = validarPessoaOuCasa(pessoa_id, casa_id);
    if (erroXor) return res.status(400).json({ erro: erroXor });

    const erroCampos = validarCampos(req.body);
    if (erroCampos) return res.status(400).json({ erro: erroCampos });

    if (!(await origemExiste(origem_id))) {
      return res.status(400).json({ erro: 'origem_id inválido' });
    }

    if (!(await autorizarEscrita(pessoaId, casa_id ?? null, pessoa_id ?? null))) {
      return res.status(403).json({ erro: 'Você não tem permissão para criar receita fixa neste escopo' });
    }

    if (receita_fixa_anterior_id !== undefined && receita_fixa_anterior_id !== null) {
      const { rows: anteriores } = await pool.query('SELECT * FROM receitas_fixas WHERE id = $1', [receita_fixa_anterior_id]);
      if (anteriores.length === 0) return res.status(400).json({ erro: 'receita_fixa_anterior_id inválido' });

      const anterior = anteriores[0];
      const mesmoEscopo =
        (anterior.casa_id !== null && anterior.casa_id === (casa_id ?? null)) ||
        (anterior.pessoa_id !== null && anterior.pessoa_id === (pessoa_id ?? null));
      if (!mesmoEscopo) return res.status(400).json({ erro: 'a receita fixa anterior deve pertencer ao mesmo escopo (mesma casa ou mesma pessoa)' });
      if (anterior.vigente_ate === null) return res.status(400).json({ erro: 'encerre a receita fixa anterior antes de criar a nova versão' });
    }

    // lancado_por_id é sempre o usuário autenticado — nunca vem do body
    const { rows } = await pool.query(
      `INSERT INTO receitas_fixas
         (casa_id, pessoa_id, origem_id, descricao, tipo_confiabilidade, valor_esperado,
          periodicidade, dia_esperado_recebimento, vigente_desde, vigente_ate, receita_fixa_anterior_id, lancado_por_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
      [
        orNull(casa_id), orNull(pessoa_id), origem_id, descricao, tipo_confiabilidade, orNull(valor_esperado),
        periodicidade, dia_esperado_recebimento, vigente_desde, orNull(vigente_ate), orNull(receita_fixa_anterior_id), pessoaId,
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
    const { rows: existentes } = await pool.query('SELECT * FROM receitas_fixas WHERE id = $1', [req.params.id]);
    if (existentes.length === 0) return res.status(404).json({ erro: 'Receita fixa não encontrada' });

    const atual = existentes[0];
    if (!(await autorizarEscrita(pessoaId, atual.casa_id, atual.pessoa_id))) {
      return res.status(403).json({ erro: 'Você não tem permissão para editar esta receita fixa' });
    }

    // casa_id/pessoa_id, receita_fixa_anterior_id e lancado_por_id não são
    // alteráveis via PUT — escopo e sucessão são fixos desde a criação
    const { origem_id, descricao, tipo_confiabilidade, valor_esperado, periodicidade, dia_esperado_recebimento, vigente_desde, vigente_ate } = req.body;

    const erroCampos = validarCampos(req.body);
    if (erroCampos) return res.status(400).json({ erro: erroCampos });

    if (!(await origemExiste(origem_id))) {
      return res.status(400).json({ erro: 'origem_id inválido' });
    }

    const { rows } = await pool.query(
      `UPDATE receitas_fixas
       SET origem_id = $1, descricao = $2, tipo_confiabilidade = $3, valor_esperado = $4,
           periodicidade = $5, dia_esperado_recebimento = $6, vigente_desde = $7, vigente_ate = $8
       WHERE id = $9 RETURNING *`,
      [origem_id, descricao, tipo_confiabilidade, orNull(valor_esperado), periodicidade, dia_esperado_recebimento, vigente_desde, orNull(vigente_ate), req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

router.use('/:id/excecoes', createExcecoesRouter({
  tabelaPai: 'receitas_fixas',
  tabelaExcecao: 'receita_fixa_excecoes',
  fkPai: 'receita_fixa_id',
  campoValorEsperadoPai: 'valor_esperado',
  nomePai: 'Receita fixa',
}));

router.patch('/:id/encerrar', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { rows: existentes } = await pool.query('SELECT * FROM receitas_fixas WHERE id = $1', [req.params.id]);
    if (existentes.length === 0) return res.status(404).json({ erro: 'Receita fixa não encontrada' });

    const atual = existentes[0];
    if (!(await autorizarEscrita(pessoaId, atual.casa_id, atual.pessoa_id))) {
      return res.status(403).json({ erro: 'Você não tem permissão para encerrar esta receita fixa' });
    }
    if (atual.vigente_ate !== null) return res.status(400).json({ erro: 'receita fixa já encerrada' });

    const { vigente_ate } = req.body ?? {};
    if (vigente_ate !== undefined && vigente_ate !== null && !ehDataValida(vigente_ate)) {
      return res.status(400).json({ erro: 'vigente_ate deve estar no formato AAAA-MM-DD' });
    }

    // default: hoje no fuso de quem encerra (não o CURRENT_DATE do servidor)
    const vigenteAteEfetiva = orNull(vigente_ate) ?? hojeNoFuso((req as any).usuario.fuso_horario);
    const { rows } = await pool.query(
      'UPDATE receitas_fixas SET vigente_ate = $1 WHERE id = $2 RETURNING *',
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

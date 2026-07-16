import { Router } from 'express';
import pool from '../db';
import { autenticar } from '../middleware/auth';
import { ehNumeroValido } from '../utils/numero';

const router = Router();
const orNull = (value: unknown) => (value === undefined ? null : value);

const TIPOS = ['credito', 'debito', 'aplicacao'];

function ehDataValida(valor: unknown): valor is string {
  return typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(valor) && !isNaN(Date.parse(valor));
}

const presente = (valor: unknown) => valor !== undefined && valor !== null;

// Regras entre colunas/linhas por tipo — na camada de app (CHECKs de SQL não
// cruzam linhas): crédito tem fatura/limite/conta que paga; conta
// (débito/aplicação) tem saldo_base e não tem nada de fatura.
async function validarCamposCartaoConta(body: any): Promise<string | null> {
  const { tipo, titular_id, limite, dia_fechamento, dia_vencimento, saldo_base, saldo_base_data, conta_debito_id } = body;

  if (!TIPOS.includes(tipo)) return "tipo deve ser 'credito', 'debito' ou 'aplicacao'";

  if (tipo === 'credito') {
    if (presente(saldo_base) || presente(saldo_base_data)) {
      return 'saldo_base/saldo_base_data só se aplicam a contas (débito/aplicação)';
    }
    if (presente(limite) && !ehNumeroValido(limite)) return 'limite deve ser um número';
    if (presente(conta_debito_id)) {
      const { rows } = await pool.query('SELECT tipo, titular_id FROM cartoes_contas WHERE id = $1', [conta_debito_id]);
      if (rows.length === 0) return 'conta_debito_id inválido';
      if (rows[0].tipo === 'credito') return 'conta_debito_id deve apontar para uma conta (débito/aplicação), não para outro cartão de crédito';
      if (rows[0].titular_id !== Number(titular_id)) return 'a conta que paga a fatura deve pertencer ao mesmo titular do cartão';
    }
  } else {
    for (const [campo, valor] of [['limite', limite], ['dia_fechamento', dia_fechamento], ['dia_vencimento', dia_vencimento], ['conta_debito_id', conta_debito_id]] as const) {
      if (presente(valor)) return `${campo} só se aplica a cartões de crédito`;
    }
    if (presente(saldo_base) !== presente(saldo_base_data)) {
      return 'saldo_base e saldo_base_data devem ser informados juntos';
    }
    if (presente(saldo_base) && !ehNumeroValido(saldo_base)) return 'saldo_base deve ser um número';
    if (presente(saldo_base_data) && !ehDataValida(saldo_base_data)) return 'saldo_base_data deve estar no formato AAAA-MM-DD';
  }
  return null;
}

router.get('/', autenticar, async (req, res, next) => {
  try {
    const { ativo } = req.query;
    const pessoaId = (req as any).usuario.id;
    const params: unknown[] = [pessoaId];
    let query = `
      SELECT cc.*, (cc.titular_id = $1) AS pode_editar
      FROM cartoes_contas cc
      WHERE cc.titular_id = $1
         OR EXISTS (
           SELECT 1 FROM cartao_casa_visibilidade v
           WHERE v.cartao_id = cc.id AND v.compartilhado = true
             AND v.casa_id IN (SELECT casa_id FROM casa_pessoas WHERE pessoa_id = $1)
         )
    `;

    if (ativo !== undefined) {
      params.push(ativo === 'true');
      query += ` AND cc.ativo = $${params.length}`;
    }

    query += ' ORDER BY cc.nome';
    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    next(err);
  }
});

router.post('/', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const { nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento, saldo_base, saldo_base_data, conta_debito_id } = req.body;

    if (!nome || !tipo) return res.status(400).json({ erro: 'nome e tipo são obrigatórios' });
    if (titular_id === undefined || titular_id === null) {
      return res.status(400).json({ erro: 'titular_id é obrigatório' });
    }

    const erroCampos = await validarCamposCartaoConta(req.body);
    if (erroCampos) return res.status(400).json({ erro: erroCampos });

    if (Number(titular_id) !== pessoaId) {
      const { rows: permRows } = await pool.query(
        `SELECT EXISTS (
           SELECT 1
           FROM casa_pessoas cp_titular
           JOIN casa_pessoas cp_user ON cp_user.casa_id = cp_titular.casa_id
           WHERE cp_titular.pessoa_id = $1
             AND cp_user.pessoa_id = $2
             AND cp_user.papel = 'admin'
         ) AS pode`,
        [titular_id, pessoaId]
      );
      if (!permRows[0].pode) return res.status(403).json({ erro: 'Você não pode atribuir este cartão/conta a essa pessoa' });
    }

    const { rows } = await pool.query(
      `INSERT INTO cartoes_contas (nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento, saldo_base, saldo_base_data, conta_debito_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [nome, tipo, titular_id, orNull(limite), orNull(dia_fechamento), orNull(dia_vencimento), orNull(saldo_base), orNull(saldo_base_data), orNull(conta_debito_id)]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    next(err);
  }
});

// Confere se `pessoaId` é o titular do registro — mirror estrito da RLS
// (cartoes_contas_update_titular), sem fallback de admin de casa compartilhada.
async function autorizarGerenciamento(
  pessoaId: number,
  cartaoContaId: string
): Promise<'ok' | 'nao_encontrado' | 'sem_permissao'> {
  const { rows } = await pool.query('SELECT titular_id FROM cartoes_contas WHERE id = $1', [cartaoContaId]);
  if (rows.length === 0) return 'nao_encontrado';
  return rows[0].titular_id === pessoaId ? 'ok' : 'sem_permissao';
}

router.put('/:id', autenticar, async (req, res, next) => {
  try {
    const pessoaId = (req as any).usuario.id;
    const autorizacao = await autorizarGerenciamento(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Registro não encontrado' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para editar este cartão/conta' });

    const { nome, tipo, titular_id, limite, dia_fechamento, dia_vencimento, saldo_base, saldo_base_data, conta_debito_id } = req.body;

    if (!nome || !tipo) return res.status(400).json({ erro: 'nome e tipo são obrigatórios' });
    if (titular_id === undefined || titular_id === null) {
      return res.status(400).json({ erro: 'titular_id é obrigatório' });
    }

    const erroCampos = await validarCamposCartaoConta(req.body);
    if (erroCampos) return res.status(400).json({ erro: erroCampos });

    // não deixa uma conta virar crédito enquanto houver cartões cuja fatura
    // desagua nela ou receitas (fixas) que a usam como destino
    if (tipo === 'credito') {
      const { rows: dependentes } = await pool.query(
        `SELECT 1 FROM cartoes_contas WHERE conta_debito_id = $1
         UNION ALL SELECT 1 FROM receitas_fixas WHERE conta_destino_id = $1
         UNION ALL SELECT 1 FROM receitas WHERE conta_destino_id = $1
         LIMIT 1`,
        [req.params.id]
      );
      if (dependentes.length > 0) {
        return res.status(400).json({ erro: 'esta conta é usada como destino de receitas ou paga faturas de cartões — desvincule antes de mudar o tipo' });
      }
    }

    const { rows } = await pool.query(
      `UPDATE cartoes_contas
       SET nome = $1, tipo = $2, titular_id = $3, limite = $4, dia_fechamento = $5, dia_vencimento = $6,
           saldo_base = $7, saldo_base_data = $8, conta_debito_id = $9
       WHERE id = $10 RETURNING *`,
      [nome, tipo, titular_id, orNull(limite), orNull(dia_fechamento), orNull(dia_vencimento), orNull(saldo_base), orNull(saldo_base_data), orNull(conta_debito_id), req.params.id]
    );

    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
});

async function setAtivo(req: any, res: any, next: any, ativo: boolean) {
  try {
    const pessoaId = req.usuario.id;
    const autorizacao = await autorizarGerenciamento(pessoaId, req.params.id);
    if (autorizacao === 'nao_encontrado') return res.status(404).json({ erro: 'Registro não encontrado' });
    if (autorizacao === 'sem_permissao') return res.status(403).json({ erro: 'Você não tem permissão para alterar este cartão/conta' });

    const { rows } = await pool.query(
      'UPDATE cartoes_contas SET ativo = $1 WHERE id = $2 RETURNING *',
      [ativo, req.params.id]
    );
    res.json(rows[0]);
  } catch (err) {
    next(err);
  }
}

router.patch('/:id/ativar', autenticar, (req, res, next) => setAtivo(req, res, next, true));
router.patch('/:id/desativar', autenticar, (req, res, next) => setAtivo(req, res, next, false));

export default router;

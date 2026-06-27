import { Router } from 'express';

const router = Router();

type TipoTransacao = 'receita' | 'despesa';

interface Transacao {
  id: number;
  descricao: string;
  valor: number;
  tipo: TipoTransacao;
}

let transacoes: Transacao[] = [];
let nextId = 1;

router.get('/', (req, res) => {
  res.json(transacoes);
});

router.post('/', (req, res) => {
  const { descricao, valor, tipo } = req.body;

  if (!descricao || valor === undefined || !tipo) {
    return res.status(400).json({ erro: 'descricao, valor e tipo são obrigatórios' });
  }

  const transacao: Transacao = { id: nextId++, descricao, valor, tipo };
  transacoes.push(transacao);
  res.status(201).json(transacao);
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const tamanhoAnterior = transacoes.length;
  transacoes = transacoes.filter((t) => t.id !== id);

  if (transacoes.length === tamanhoAnterior) {
    return res.status(404).json({ erro: 'Transação não encontrada' });
  }

  res.status(204).send();
});

export default router;

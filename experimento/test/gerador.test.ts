// Piloto: o gerador de dados sintéticos (puro, sem banco).

import { gerarPlano, MISTURA } from '../src/gerador';

describe('gerador de dados sintéticos', () => {
  test('mesma semente, mesmo plano; outra semente, outro plano', () => {
    expect(gerarPlano(1, 2000)).toEqual(gerarPlano(1, 2000));
    expect(gerarPlano(2, 2000).operacoes).not.toEqual(gerarPlano(1, 2000).operacoes);
  });

  test.each([1, 7, 1000, 10000])('fecha em exatamente %i eventos', (n) => {
    const plano = gerarPlano(3, n);
    expect(plano.operacoes.reduce((s, op) => s + op.eventos, 0)).toBe(n);
  });

  test('com 10.000 eventos, todos os tipos de operação aparecem', () => {
    const tipos = new Set(gerarPlano(1, 10000).operacoes.map((op) => op.tipo));
    expect([...tipos].sort()).toEqual(MISTURA.map(([t]) => t).sort());
  });

  test('edição de compra conta 1 + parcelas antigas + parcelas novas', () => {
    const plano = gerarPlano(1, 5000);
    const parcelas = new Map<number, number>();
    let ordinal = 0;
    for (const op of plano.operacoes) {
      if (op.tipo === 'inserir_compra') parcelas.set(ordinal++, op.valores.length);
      if (op.tipo === 'editar_compra') {
        expect(op.eventos).toBe(1 + parcelas.get(op.compra)! + op.valores.length);
        parcelas.set(op.compra, op.valores.length);
      }
    }
  });

  test('espaço pessoal: só a dona é responsável e registradora', () => {
    const plano = gerarPlano(1, 3000);
    for (const op of plano.operacoes) {
      if (op.tipo !== 'inserir_compra' && op.tipo !== 'inserir_receita') continue;
      const casa = plano.populacao.casas[op.casa];
      if (!casa.pessoal) continue;
      expect(op.registrador).toBe(casa.dono);
      if (op.pessoa !== null) expect(op.pessoa).toBe(casa.dono);
    }
  });
});

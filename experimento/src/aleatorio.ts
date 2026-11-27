// Números pseudoaleatórios com semente fixa (mulberry32), para que a mesma
// semente gere exatamente a mesma carga em A e em B e em qualquer máquina.
// Não serve para criptografia; serve para reprodutibilidade.

export interface Aleatorio {
  proximo(): number;                                  // [0, 1)
  inteiro(min: number, max: number): number;          // [min, max]
  escolher<T>(lista: readonly T[]): T;
  ponderado<T>(opcoes: ReadonlyArray<readonly [T, number]>): T;
  chance(p: number): boolean;
  centavos(min: number, max: number): string;         // valor com 2 casas, ex. "123.45"
}

export function criarAleatorio(semente: number): Aleatorio {
  let a = semente >>> 0;
  const proximo = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const inteiro = (min: number, max: number) => min + Math.floor(proximo() * (max - min + 1));
  return {
    proximo,
    inteiro,
    escolher: (lista) => {
      if (lista.length === 0) throw new Error('escolher: lista vazia');
      return lista[Math.floor(proximo() * lista.length)];
    },
    ponderado: (opcoes) => {
      const total = opcoes.reduce((s, [, peso]) => s + peso, 0);
      let r = proximo() * total;
      for (const [valor, peso] of opcoes) {
        r -= peso;
        if (r < 0) return valor;
      }
      return opcoes[opcoes.length - 1][0];
    },
    chance: (p) => proximo() < p,
    centavos: (min, max) => {
      const c = inteiro(Math.round(min * 100), Math.round(max * 100));
      return `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`;
    },
  };
}

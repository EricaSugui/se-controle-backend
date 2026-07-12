// Colunas NUMERIC do Postgres esperam um number JS (ex.: 179.90), não uma string
// formatada (ex.: "179,90"), que o driver `pg` rejeita e vira 500 genérico.
export function ehNumeroValido(valor: unknown): valor is number {
  return typeof valor === 'number' && Number.isFinite(valor);
}

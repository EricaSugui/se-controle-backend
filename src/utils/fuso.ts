export const FUSO_PADRAO = 'America/Sao_Paulo';

// Aceita qualquer fuso IANA que o runtime conheça (ex: America/Manaus,
// Pacific/Honolulu) — Intl lança RangeError para fusos desconhecidos.
export function ehFusoValido(fuso: unknown): fuso is string {
  if (typeof fuso !== 'string' || fuso.length === 0) return false;
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: fuso });
    return true;
  } catch {
    return false;
  }
}

// Data de "hoje" (YYYY-MM-DD) no fuso informado. O locale en-CA formata
// exatamente como YYYY-MM-DD.
export function hojeNoFuso(fuso: string | null | undefined): string {
  const fusoEfetivo = ehFusoValido(fuso) ? fuso : FUSO_PADRAO;
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: fusoEfetivo,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

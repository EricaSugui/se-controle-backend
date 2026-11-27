#!/usr/bin/env bash
#
# Piloto do experimento (roteiro, seção 9): A e B, 1.000 e 10.000 eventos,
# 3 repetições (sementes 1, 2 e 3), pareadas por semente.
#
#   npm run exp:piloto                     → pasta experimento/resultados/<data>-piloto
#   npm run exp:piloto -- <pasta>          → outra pasta
#
# Para reduzir o efeito de deriva da máquina, a ordem A/B alterna a cada
# repetição (semente ímpar: A primeiro; par: B primeiro). Cada rodada recria
# o banco do zero. No fim, consolida tudo em resumo.csv.
#
# Antes de rodar: Docker Desktop aberto, Supabase local do DEV parado
# (npm run supabase:stop) e programas pesados fechados (NOTAS.md).

set -euo pipefail
cd "$(dirname "$0")/../.."   # raiz do back

PASTA="${1:-experimento/resultados/$(date +%Y-%m-%d)-piloto}"
VOLUMES=(1000 10000)
SEMENTES=(1 2 3)

mkdir -p "$PASTA"
echo "Piloto em $PASTA"

for volume in "${VOLUMES[@]}"; do
  for semente in "${SEMENTES[@]}"; do
    if (( semente % 2 == 1 )); then ordem=(a b); else ordem=(b a); fi
    for condicao in "${ordem[@]}"; do
      npm run -s exp:rodada -- --condicao "$condicao" --eventos "$volume" --semente "$semente" \
        --saida "$PASTA/${volume}-${condicao}-s${semente}"
    done
  done
done

npm run -s exp:resumir -- "$PASTA"

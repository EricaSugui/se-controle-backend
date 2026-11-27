#!/usr/bin/env bash
#
# Recria do zero o banco de medição do experimento do TCC.
#
#   npm run exp:recriar -- a      → condição A (log convencional)
#   npm run exp:recriar -- b      → condição B (log com hash chain)
#   npm run exp:recriar -- base   → só o schema do produto, sem auditoria
#
# 1. Derruba o contêiner e APAGA o volume (só o do experimento).
# 2. Sobe o Postgres 17 de medição (docker-compose.yml) e espera ficar pronto.
# 3. Aplica a compatibilidade mínima com o Supabase (sql/00-*.sql).
# 4. Aplica todas as migrations do produto (node-pg-migrate).
# 5. Aplica o SQL do experimento: sql/1*.sql (comum) e sql/2*-condicao-<x>.sql.
#
# Nunca toca no Supabase local do DEV, no TCC nem em PROD: a URL é fixa em
# 127.0.0.1:55432 e o node-pg-migrate lê uma variável própria
# (EXPERIMENTO_DATABASE_URL), e não a DATABASE_URL.
#
# Requer Docker Desktop rodando.

set -euo pipefail

CONDICAO="${1:?Informe a condição: a, b ou base}"
case "$CONDICAO" in a|b|base) ;; *) echo "Condição inválida: $CONDICAO (use a, b ou base)"; exit 1 ;; esac

cd "$(dirname "$0")/../.."   # raiz do back
EXP="experimento"
COMPOSE=(docker compose -f "$EXP/docker-compose.yml")

command -v docker >/dev/null || { echo "Docker não encontrado. Abra o Docker Desktop."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker não está rodando. Abra o Docker Desktop e tente de novo."; exit 1; }

export EXPERIMENTO_DATABASE_URL="postgresql://postgres:experimento@127.0.0.1:55432/experimento"

psql_exp() {
  # psql de dentro do contêiner: não depende de psql instalado no Windows.
  "${COMPOSE[@]}" exec -T medicao psql -v ON_ERROR_STOP=1 -q -U postgres -d experimento "$@"
}

aplicar_sql() {
  local arquivo="$1"
  echo "   · $(basename "$arquivo")"
  psql_exp < "$arquivo"
}

echo "→ Derrubando o banco de medição anterior (volume apagado)..."
"${COMPOSE[@]}" down -v --remove-orphans >/dev/null 2>&1 || true

echo "→ Subindo Postgres de medição (127.0.0.1:55432)..."
"${COMPOSE[@]}" up -d --wait --quiet-pull >/dev/null 2>&1 || {
  echo "Não consegui subir o contêiner. Detalhes:"; "${COMPOSE[@]}" logs --tail 30 medicao; exit 1;
}

echo "→ Compatibilidade com o Supabase:"
for f in "$EXP"/sql/0*.sql; do aplicar_sql "$f"; done

echo "→ Migrations do produto..."
node_modules/.bin/node-pg-migrate up \
  --database-url-var EXPERIMENTO_DATABASE_URL \
  --migrations-dir migrations >/dev/null
echo "   · $(psql_exp -At -c 'SELECT count(*) FROM pgmigrations') migrations aplicadas"

if [ "$CONDICAO" != "base" ]; then
  echo "→ SQL do experimento (condição ${CONDICAO^^}):"
  shopt -s nullglob
  comuns=("$EXP"/sql/1*.sql)
  condicao=("$EXP"/sql/2*-condicao-"$CONDICAO".sql)
  shopt -u nullglob
  [ ${#comuns[@]} -gt 0 ] || [ ${#condicao[@]} -gt 0 ] || echo "   · (nenhum ainda: blocos 1 e 2)"
  for f in "${comuns[@]}" "${condicao[@]}"; do aplicar_sql "$f"; done
fi

echo "✓ Banco de medição pronto: condição ${CONDICAO^^}, $EXPERIMENTO_DATABASE_URL"

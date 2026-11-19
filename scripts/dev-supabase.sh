#!/usr/bin/env bash
#
# Ambiente DEV local: Supabase local (Docker) + migrations + fixtures.
#
#   npm run supabase:start   → sobe o Supabase local (ou reaproveita), grava as
#                              chaves locais em .env.dev (e em ../front/.env.dev,
#                              se existir), aplica a paridade com a plataforma,
#                              as migrations e as fixtures
#   npm run supabase:stop    → para os containers, MANTENDO os dados
#   npm run supabase:reset   → apaga o banco local e recria do zero
#   npm run supabase:status  → URLs e estado
#
# Só Auth + banco (+ Studio e Mailpit para inspeção). As chaves do Supabase
# local são as chaves de desenvolvimento padrão da CLI (não são segredo) e
# não valem em nenhum projeto da nuvem.
#
# Plano de ambientes: 4.1 e 4.2 (se-controle-workspace).

set -euo pipefail

ACAO="${1:-start}"
cd "$(dirname "$0")/.."
source scripts/lib-db.sh

SUPABASE="$(pwd)/node_modules/.bin/supabase"
[ -x "$SUPABASE" ] || { echo "CLI do Supabase não encontrada. Rode npm install no back."; exit 1; }
EXCLUIR="realtime,storage-api,imgproxy,postgrest,edge-runtime,logflare,vector,supavisor"
FRONT_ENV="../front/.env.dev"

# Atualiza (ou acrescenta) VAR=valor num arquivo .env, sem tocar no resto.
definir_var() {
  local arquivo="$1" var="$2" valor="$3"
  [ -f "$arquivo" ] || return 0
  ARQ="$arquivo" VAR="$var" VAL="$valor" node -e '
    const fs = require("fs");
    const { ARQ, VAR, VAL } = process.env;
    let s = fs.readFileSync(ARQ, "utf8");
    const re = new RegExp(`^${VAR}=.*$`, "m");
    s = re.test(s) ? s.replace(re, `${VAR}=${VAL}`) : s.replace(/\n?$/, `\n${VAR}=${VAL}\n`);
    fs.writeFileSync(ARQ, s);
  '
}

valor_var() {
  local arquivo="$1" var="$2"
  grep -E "^${var}=" "$arquivo" 2>/dev/null | head -1 | cut -d= -f2- || true
}

subir() {
  preparar_docker
  [ -f .env.dev ] || cp .env.example .env.dev

  echo "→ Subindo Supabase local (projeto se-controle-dev, portas 543xx)..."
  "$SUPABASE" start -x "$EXCLUIR" >/dev/null

  # Chaves e URLs do Supabase local.
  eval "$("$SUPABASE" status -o env 2>/dev/null | grep -E '^(API_URL|DB_URL|ANON_KEY|SERVICE_ROLE_KEY)=')"
  : "${API_URL:?}" "${DB_URL:?}" "${ANON_KEY:?}" "${SERVICE_ROLE_KEY:?}"

  echo "→ Gravando as chaves locais em .env.dev..."
  definir_var .env.dev DATABASE_URL "$DB_URL"
  definir_var .env.dev SUPABASE_URL "$API_URL"
  definir_var .env.dev SUPABASE_ANON_KEY "$ANON_KEY"
  definir_var .env.dev SUPABASE_SERVICE_ROLE_KEY "$SERVICE_ROLE_KEY"
  definir_var .env.dev FRONTEND_URL "http://localhost:8081"
  # Senhas das fixtures: só locais, num banco descartável.
  for v in HML_FIXTURE_ADMIN_PASSWORD HML_FIXTURE_MEMBER1_PASSWORD HML_FIXTURE_MEMBER2_PASSWORD; do
    [ -n "$(valor_var .env.dev "$v")" ] || definir_var .env.dev "$v" "senha-dev-local-123"
  done
  if [ -f "$FRONT_ENV" ]; then
    echo "→ Gravando as chaves locais em ../front/.env.dev..."
    definir_var "$FRONT_ENV" EXPO_PUBLIC_SUPABASE_API_KEY "$ANON_KEY"
    # Preserva a URL quando já aponta para o IP da máquina na rede (uso no
    # celular); só preenche quando está vazia ou é localhost/127.0.0.1.
    URL_FRONT=$(valor_var "$FRONT_ENV" EXPO_PUBLIC_SUPABASE_URL)
    if [ -z "$URL_FRONT" ] || echo "$URL_FRONT" | grep -qE '//(127\.0\.0\.1|localhost)[:/]'; then
      definir_var "$FRONT_ENV" EXPO_PUBLIC_SUPABASE_URL "$API_URL"
    else
      echo "  (EXPO_PUBLIC_SUPABASE_URL mantida: $URL_FRONT)"
    fi
  fi

  echo "→ Paridade com a plataforma (ensure_rls)..."
  executar_sql "$DB_URL" < supabase/paridade-plataforma.sql

  echo "→ Migrations..."
  npx node-pg-migrate up --envPath .env.dev 2>&1 | grep -E "^(> )?Migrating|No migrations to run|Migrations complete" | tail -2 || true

  echo "→ Fixtures..."
  npx dotenv -e .env.dev -- node scripts/seed-fixtures-db.js | tail -3

  mostrar_resumo
}

mostrar_resumo() {
  local admin
  admin=$(valor_var .env.dev HML_FIXTURE_ADMIN_EMAIL)
  cat <<EOF

✔ DEV local pronto
  API do Supabase   http://127.0.0.1:54321
  Banco             postgresql://postgres:postgres@127.0.0.1:54322/postgres
  Studio (painel)   http://127.0.0.1:54323
  Mailpit (e-mails) http://127.0.0.1:54324   ← convites e e-mails do Auth chegam aqui

  Login de teste: ${admin:-teste.admin@fixture.example} / senha em HML_FIXTURE_ADMIN_PASSWORD (.env.dev)

  Próximo: npm run dev (back)  e  npm run web (front)
EOF
}

case "$ACAO" in
  start) subir ;;
  stop)
    preparar_docker
    "$SUPABASE" stop
    echo "Supabase local parado (dados mantidos). Para subir de novo: npm run supabase:start"
    ;;
  reset)
    preparar_docker
    echo "→ Apagando o banco local (só o DEV; nuvem não é afetada)..."
    "$SUPABASE" stop --no-backup >/dev/null 2>&1 || true
    subir
    ;;
  status)
    preparar_docker
    "$SUPABASE" status
    ;;
  *) echo "Ação inválida: $ACAO (start | stop | reset | status)"; exit 1 ;;
esac

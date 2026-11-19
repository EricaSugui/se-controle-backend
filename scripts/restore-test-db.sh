#!/usr/bin/env bash
#
# Teste de restauração de um backup gerado por backup-db.sh.
#
#   npm run db:restore-test -- prod                  → backup de PROD mais recente
#   npm run db:restore-test -- tcc                   → backup do TCC mais recente
#   npm run db:restore-test -- <arquivo.tar.gz.enc>  → um backup específico
#
# Os backups ficam em $BACKUP_DIR (padrão ~/se-controle-backups).
#
# 1. Confere o .sha256 (se existir) e descriptografa numa pasta temporária.
# 2. Sobe uma instância Supabase DESCARTÁVEL e isolada (projeto
#    "se-controle-restore-test", portas 544xx — não conflita com o DEV
#    local em 543xx), só com banco, Auth e Storage.
# 3. Restaura na ordem recomendada pelo Supabase: roles → schema → dados
#    (com session_replication_role = replica), numa única transação.
# 4. Compara última migration e contagem de linhas por tabela com o
#    manifesto gravado no backup.
# 5. Ao sair (sucesso OU erro): para a instância apagando os volumes e
#    remove a pasta temporária. Dados de PROD não ficam na máquina.
#
# Requer Docker Desktop rodando. Senha: a mesma do backup (cofre), pedida
# na hora ou via BACKUP_PASSPHRASE.

set -euo pipefail

ALVO="${1:?Informe prod, tcc ou o arquivo de backup (.tar.gz.enc)}"
BACKUP_DIR="${BACKUP_DIR:-$HOME/se-controle-backups}"
case "$ALVO" in
  prod|tcc)
    # Mais recente pelo carimbo no nome (AAAAMMDD-HHMMSS ordena corretamente).
    ARQUIVO=$(ls "$BACKUP_DIR"/"$ALVO"-*.tar.gz.enc 2>/dev/null | sort | tail -1 || true)
    [ -n "$ARQUIVO" ] || { echo "Nenhum backup de $ALVO em $BACKUP_DIR. Gere com: npm run db:backup:$ALVO"; exit 1; }
    echo "→ Backup mais recente de $ALVO: $(basename "$ARQUIVO")"
    ;;
  *) ARQUIVO="$ALVO" ;;
esac
[ -f "$ARQUIVO" ] || { echo "Arquivo não encontrado: $ARQUIVO"; exit 1; }
# Caminho absoluto antes de mudar de pasta (aceita caminho relativo).
ARQUIVO="$(cd "$(dirname "$ARQUIVO")" && pwd)/$(basename "$ARQUIVO")"
cd "$(dirname "$0")/.."
RAIZ_BACK="$(pwd)"
SUPABASE="$RAIZ_BACK/node_modules/.bin/supabase"

for d in "${LOCALAPPDATA:-}/Programs/DockerDesktop/resources/bin" "/c/Program Files/Docker/Docker/resources/bin"; do
  [ -d "$d" ] && PATH="$PATH:$d"
done
command -v docker >/dev/null || { echo "Docker não encontrado. Instale/abra o Docker Desktop."; exit 1; }
docker info >/dev/null 2>&1 || { echo "Docker não está rodando. Abra o Docker Desktop e tente de novo."; exit 1; }
[ -x "$SUPABASE" ] || { echo "CLI do Supabase não encontrada. Rode npm install no back."; exit 1; }
[ -f "$ARQUIVO" ] || { echo "Arquivo não encontrado: $ARQUIVO"; exit 1; }

if [ -f "$ARQUIVO.sha256" ]; then
  echo "→ Conferindo integridade (sha256)..."
  ( cd "$(dirname "$ARQUIVO")" && sha256sum -c --quiet "$(basename "$ARQUIVO").sha256" )
fi

if [ -z "${BACKUP_PASSPHRASE:-}" ]; then
  read -rsp "Senha do backup: " BACKUP_PASSPHRASE; echo
fi
export BACKUP_PASSPHRASE

PROJETO="se-controle-restore-test"
CONTAINER_DB="supabase_db_${PROJETO}"
PORTA_DB=54422

TMP=$(mktemp -d)
limpar() {
  echo "→ Limpando: parando a instância de teste e apagando volumes e arquivos temporários..."
  "$SUPABASE" stop --workdir "$TMP/stack" --no-backup >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpar EXIT

echo "→ Descriptografando..."
mkdir -p "$TMP/backup"
openssl enc -d -aes-256-cbc -pbkdf2 -iter 600000 -pass env:BACKUP_PASSPHRASE -in "$ARQUIVO" \
  | tar -xzf - -C "$TMP/backup" \
  || { echo "Falha ao descriptografar (senha errada ou arquivo corrompido)."; exit 1; }
for f in roles.sql schema.sql data.sql manifest.json; do
  [ -f "$TMP/backup/$f" ] || { echo "Backup incompleto: falta $f"; exit 1; }
done

echo "→ Preparando instância descartável ($PROJETO, portas 544xx)..."
mkdir -p "$TMP/stack"
"$SUPABASE" init --workdir "$TMP/stack" >/dev/null
CONFIG="$TMP/stack/supabase/config.toml"
sed -i -E "s/^project_id = .*/project_id = \"$PROJETO\"/" "$CONFIG"
# Desloca todas as portas 543xx → 544xx para não colidir com o DEV local.
sed -i -E 's/= 543([0-9]{2})$/= 544\1/' "$CONFIG"
grep -qE "^port = $PORTA_DB$" "$CONFIG" || { echo "Não consegui ajustar a porta do banco no config.toml"; exit 1; }

echo "→ Subindo banco + Auth + Storage (a primeira vez baixa imagens e demora)..."
"$SUPABASE" start --workdir "$TMP/stack" \
  -x realtime,imgproxy,kong,mailpit,postgrest,postgres-meta,studio,edge-runtime,logflare,vector,supavisor \
  >/dev/null

# Papéis reservados do Supabase já existem em qualquer projeto e só podem
# ser alterados pela plataforma. Comandos sobre eles no roles.sql (ex.:
# ALTER ROLE "supabase_admin" ...) falham na restauração e são descartados;
# a documentação do Supabase trata esses erros como esperados.
RESERVADOS='anon|authenticated|service_role|authenticator|dashboard_user|pgbouncer|supabase_[a-z_]+|pgsodium_[a-z_]+'
# Só comandos SOBRE um papel reservado: o papel é o alvo do CREATE/ALTER/
# DROP/COMMENT ON ROLE, ou o destinatário (TO/FROM) do GRANT/REVOKE.
SOBRE_RESERVADO="^[[:space:]]*((CREATE|ALTER|DROP)[[:space:]]+ROLE|COMMENT[[:space:]]+ON[[:space:]]+ROLE)[[:space:]]+\"?($RESERVADOS)\"?([[:space:];]|$)"
DESTINO_RESERVADO="^[[:space:]]*(GRANT|REVOKE)[[:space:]].*[[:space:]](TO|FROM)[[:space:]]+\"?($RESERVADOS)\"?([[:space:];,]|$)"
grep -E  -e "$SOBRE_RESERVADO" -e "$DESTINO_RESERVADO" "$TMP/backup/roles.sql" > "$TMP/roles-descartados.sql" || true
grep -vE -e "$SOBRE_RESERVADO" -e "$DESTINO_RESERVADO" "$TMP/backup/roles.sql" > "$TMP/roles-filtrado.sql" || true
if [ -s "$TMP/roles-descartados.sql" ]; then
  echo "→ Ignorando $(wc -l < "$TMP/roles-descartados.sql" | tr -d ' ') comando(s) sobre papéis reservados do Supabase:"
  cut -c1-110 "$TMP/roles-descartados.sql" | sed 's/^/    /'
fi

echo "→ Restaurando (roles → schema → dados, transação única)..."
# Os arquivos vão pela entrada padrão do psql, sem caminhos dentro do
# container: o Git Bash reescreve argumentos como /tmp/... para caminhos do
# Windows, o que quebraria `docker cp`/`psql -f` no container.
{
  cat "$TMP/roles-filtrado.sql"
  cat "$TMP/backup/schema.sql"
  echo 'SET session_replication_role = replica;'
  cat "$TMP/backup/data.sql"
} | docker exec -i -e PGPASSWORD=postgres "$CONTAINER_DB" psql \
  -h localhost -U postgres -d postgres -q \
  --single-transaction -v ON_ERROR_STOP=1 \
  -v VERBOSITY=default --echo-errors \
  >/dev/null

echo "→ Conferindo contra o manifesto..."
DB_MANIFEST_URL="postgresql://postgres:postgres@127.0.0.1:${PORTA_DB}/postgres" \
  node scripts/db-manifest.js restaurado > "$TMP/manifest-restaurado.json"

node -e '
  const [origem, restaurado] = process.argv.slice(1).map((f) => require(f));
  const nomes = [...new Set([...Object.keys(origem.contagens), ...Object.keys(restaurado.contagens)])].sort();
  const divergentes = nomes.filter((n) => origem.contagens[n] !== restaurado.contagens[n]);
  const migracaoOk = origem.ultima_migration === restaurado.ultima_migration;
  console.log(`\nBackup de ${origem.ambiente} gerado em ${origem.gerado_em}`);
  console.log(`  última migration: ${origem.ultima_migration ?? "—"} → ${migracaoOk ? "igual" : "DIFERENTE: " + restaurado.ultima_migration}`);
  console.log(`  tabelas: ${origem.tabelas} → ${restaurado.tabelas} · linhas: ${origem.linhas_total} → ${restaurado.linhas_total}`);
  for (const n of divergentes) console.log(`  ✗ ${n}: ${origem.contagens[n] ?? "ausente"} → ${restaurado.contagens[n] ?? "ausente"}`);
  if (divergentes.length || !migracaoOk) { console.log("\n✗ RESTAURAÇÃO DIVERGENTE"); process.exit(1); }
  console.log("\n✔ Restauração conferida: todas as contagens batem.");
' "$TMP/backup/manifest.json" "$TMP/manifest-restaurado.json"

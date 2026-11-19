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
# 3. Restaura TUDO na ordem recomendada pelo Supabase: roles (sem os
#    comandos sobre papéis reservados) → schema → dados, numa transação.
# 4. Compara última migration e contagem de linhas por tabela com o
#    manifesto gravado no backup.
# 5. Ao sair (sucesso OU erro): para a instância apagando os volumes e
#    remove a pasta temporária. Dados de PROD não ficam na máquina.
#
# Requer Docker Desktop rodando. Senha: a mesma do backup (cofre), pedida
# na hora ou via BACKUP_PASSPHRASE.

set -euo pipefail

ALVO="${1:?Informe prod, tcc ou o arquivo de backup (.tar.gz.enc)}"
cd "$(dirname "$0")/.."
source scripts/lib-db.sh

ARQUIVO=$(resolver_backup "$ALVO")
case "$ALVO" in prod|tcc) echo "→ Backup mais recente de $ALVO: $(basename "$ARQUIVO")" ;; esac

SUPABASE="$(pwd)/node_modules/.bin/supabase"
preparar_docker
[ -x "$SUPABASE" ] || { echo "CLI do Supabase não encontrada. Rode npm install no back."; exit 1; }
pedir_senha_backup

PROJETO="se-controle-restore-test"
PORTA_DB=54422
DESTINO="postgresql://postgres:postgres@127.0.0.1:${PORTA_DB}/postgres"

TMP=$(mktemp -d)
limpar() {
  echo "→ Limpando: parando a instância de teste e apagando volumes e arquivos temporários..."
  "$SUPABASE" stop --workdir "$TMP/stack" --no-backup >/dev/null 2>&1 || true
  rm -rf "$TMP"
}
trap limpar EXIT

descriptografar_backup "$ARQUIVO" "$TMP/backup"

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

filtrar_roles "$TMP/backup/roles.sql" "$TMP/roles-filtrado.sql" "$TMP/roles-descartados.sql"

echo "→ Restaurando (roles → schema → dados, transação única)..."
{
  cat "$TMP/roles-filtrado.sql"
  node scripts/filtrar-sql.js < "$TMP/backup/schema.sql"
  echo 'SET LOCAL session_replication_role = replica;'
  node scripts/filtrar-sql.js < "$TMP/backup/data.sql"
} | executar_sql "$DESTINO"

echo "→ Conferindo contra o manifesto..."
gerar_manifesto "$DESTINO" restaurado "$TMP/manifest-restaurado.json"
comparar_manifestos "$TMP/backup/manifest.json" "$TMP/manifest-restaurado.json"

#!/usr/bin/env node
//
// Registra o ambiente de uma rodada do experimento (decisão 6).
//
//   npm run exp:ambiente -- <arquivo de saída>
//   (sem argumento, imprime no terminal)
//
// Grava hardware, sistema, versões (Node, Docker, Postgres), os limites do
// contêiner de medição, as configurações do Postgres que afetam escrita e o
// commit do código. O arquivo vai para a pasta da rodada, junto do
// checkpoint.json e das métricas.

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Client } = require('pg');

const URL_EXPERIMENTO = 'postgresql://postgres:experimento@127.0.0.1:55432/experimento';
const CONTEINER = 'se-controle-experimento-db';

// Configurações do Postgres que influenciam latência de escrita,
// armazenamento e verificação.
const CONFIGS_PG = [
  'shared_buffers', 'work_mem', 'maintenance_work_mem', 'effective_cache_size',
  'synchronous_commit', 'fsync', 'full_page_writes', 'wal_level', 'max_wal_size',
  'checkpoint_timeout', 'autovacuum', 'jit', 'TimeZone', 'server_encoding',
];

function sh(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function git(args) {
  return sh(`git -C "${path.resolve(__dirname, '../..')}" ${args}`);
}

async function postgres() {
  const client = new Client({ connectionString: URL_EXPERIMENTO });
  await client.connect();
  try {
    const versao = (await client.query('SELECT version() AS v')).rows[0].v;
    const { rows } = await client.query(
      'SELECT name, setting, unit FROM pg_settings WHERE name = ANY($1) ORDER BY name',
      [CONFIGS_PG],
    );
    const configuracoes = Object.fromEntries(
      rows.map((r) => [r.name, r.unit ? `${r.setting} ${r.unit}` : r.setting]),
    );
    const migrations = Number((await client.query('SELECT count(*) AS n FROM pgmigrations')).rows[0].n);
    const auditoria = (await client.query(
      "SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'audit') AS existe",
    )).rows[0].existe;
    return { versao, configuracoes, migrations_aplicadas: migrations, schema_audit: auditoria };
  } finally {
    await client.end();
  }
}

function conteiner() {
  const bruto = sh(`docker inspect ${CONTEINER}`);
  if (!bruto) return null;
  const [info] = JSON.parse(bruto);
  return {
    imagem: info.Config.Image,
    imagem_id: info.Image,
    cpus: info.HostConfig.NanoCpus ? info.HostConfig.NanoCpus / 1e9 : null,
    memoria_bytes: info.HostConfig.Memory || null,
    shm_bytes: info.HostConfig.ShmSize || null,
  };
}

async function main() {
  const cpus = os.cpus();
  const ambiente = {
    registrado_em: new Date().toISOString(),
    codigo: {
      repositorio: 'se-controle-backend',
      branch: git('rev-parse --abbrev-ref HEAD'),
      commit: git('rev-parse HEAD'),
      alteracoes_nao_commitadas: (git('status --porcelain') || '').length > 0,
      tags: (git('tag --points-at HEAD') || '').split('\n').filter(Boolean),
    },
    hardware: {
      cpu: cpus[0]?.model?.trim() ?? null,
      threads_logicos: cpus.length,
      memoria_total_bytes: os.totalmem(),
    },
    sistema: {
      plataforma: os.platform(),
      versao: os.release(),
      descricao: os.version ? os.version() : null,
      arquitetura: os.arch(),
    },
    versoes: {
      node: process.version,
      pg_driver: require('pg/package.json').version,
      docker_servidor: sh('docker version --format "{{.Server.Version}}"'),
      docker_cliente: sh('docker version --format "{{.Client.Version}}"'),
    },
    conteiner: conteiner(),
    postgres: await postgres(),
  };

  const saida = JSON.stringify(ambiente, null, 2) + '\n';
  const destino = process.argv[2];
  if (destino) {
    fs.mkdirSync(path.dirname(path.resolve(destino)), { recursive: true });
    fs.writeFileSync(destino, saida);
    console.log(`✓ Ambiente registrado em ${destino}`);
  } else {
    process.stdout.write(saida);
  }
}

main().catch((err) => {
  console.error('Não consegui registrar o ambiente:', err.message);
  console.error('O banco de medição está de pé? Rode: npm run exp:recriar -- base');
  process.exit(1);
});

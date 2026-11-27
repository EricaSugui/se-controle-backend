// Conexão com o banco de medição do experimento.
//
// Não usa o src/db.ts do produto, que converte `numeric` em float e perde a
// forma exata dos valores. Aqui, TODOS os tipos chegam como o texto que o
// Postgres envia (sem conversão nenhuma), e a sessão fica em UTC. É esse
// texto que o verificador serializa e compara (decisão 3).

import { Client, ClientConfig } from 'pg';

export const URL_EXPERIMENTO =
  process.env.EXPERIMENTO_DATABASE_URL ??
  'postgresql://postgres:experimento@127.0.0.1:55432/experimento';

// Só aceita o banco local do experimento: protege DEV, TCC e PROD de um
// EXPERIMENTO_DATABASE_URL trocado por engano.
function conferirUrl(url: string): void {
  if (!/@(127\.0\.0\.1|localhost):55432\//.test(url)) {
    throw new Error(`URL fora do banco de medição (127.0.0.1:55432): ${url.replace(/:[^:@/]*@/, ':***@')}`);
  }
}

const textoBruto = { getTypeParser: () => (valor: string) => valor };

export async function conectar(): Promise<Client> {
  conferirUrl(URL_EXPERIMENTO);
  const config: ClientConfig = {
    connectionString: URL_EXPERIMENTO,
    types: textoBruto as ClientConfig['types'],
    options: '-c TimeZone=UTC',
  };
  const client = new Client(config);
  await client.connect();
  return client;
}

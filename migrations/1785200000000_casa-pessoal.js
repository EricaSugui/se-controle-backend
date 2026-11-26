// Casa Pessoal (espaço pessoal): cada pessoa com login ganha uma Casa só
// dela, sem rateio, onde ficam os lançamentos e recorrências que não são de
// nenhuma Casa compartilhada. Na interface ela se chama "Pessoal".
// Especificação: se-controle-workspace, docs/planos/casa-pessoal-nucleo.md.
//
// Aditiva e compatível com o código anterior: colunas novas com padrão; o
// nome da Casa continua único, mas só entre as compartilhadas (todas as
// pessoais se chamam "Pessoal"). Cria as Casas Pessoais de quem já tem login
// (idempotente). As demais nascem por garantirCasaPessoal (src/services).

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE casas
      ADD COLUMN pessoal boolean NOT NULL DEFAULT false,
      ADD COLUMN dono_pessoa_id integer NULL REFERENCES pessoas(id);

    ALTER TABLE casas
      ADD CONSTRAINT casas_pessoal_tem_dono CHECK (pessoal = (dono_pessoa_id IS NOT NULL));

    -- no máximo uma Casa Pessoal por pessoa
    CREATE UNIQUE INDEX casas_dono_pessoa_id_unique ON casas (dono_pessoa_id) WHERE pessoal;

    -- nome único só entre as Casas compartilhadas
    ALTER TABLE casas DROP CONSTRAINT casas_nome_key;
    CREATE UNIQUE INDEX casas_nome_compartilhada_unique ON casas (nome) WHERE NOT pessoal;

    -- Casas Pessoais de quem já tem login
    WITH novas AS (
      INSERT INTO casas (nome, pessoal, dono_pessoa_id, usa_custeio)
      SELECT 'Pessoal', true, p.id, false
      FROM pessoas p
      WHERE p.supabase_user_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM casas c WHERE c.pessoal AND c.dono_pessoa_id = p.id)
      RETURNING id, dono_pessoa_id
    )
    INSERT INTO casa_pessoas (casa_id, pessoa_id, papel)
    SELECT id, dono_pessoa_id, 'admin' FROM novas;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    -- Apaga as Casas Pessoais. Despesas, receitas, recorrências e acertos
    -- referenciam casas com RESTRICT: se alguma Casa Pessoal tiver dados, o
    -- DELETE falha e o down não acontece (nada se perde em silêncio).
    -- casa_pessoas, convites, metas, percentuais e visibilidade de cartão
    -- vão em cascata; pessoas.casa_principal_id vira NULL.
    DELETE FROM casas WHERE pessoal;

    DROP INDEX casas_nome_compartilhada_unique;
    ALTER TABLE casas ADD CONSTRAINT casas_nome_key UNIQUE (nome);

    DROP INDEX casas_dono_pessoa_id_unique;
    ALTER TABLE casas DROP CONSTRAINT casas_pessoal_tem_dono;
    ALTER TABLE casas DROP COLUMN dono_pessoa_id, DROP COLUMN pessoal;
  `);
};

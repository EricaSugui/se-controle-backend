// Compartilhamento de saldo é opt-in por conta × casa, SEPARADO da
// visibilidade de lançamentos: um casal pode compartilhar tudo; a filha pode
// compartilhar os lançamentos do cartão sem expor o saldo da conta.
// compartilhado = casa vê lançamentos (existente); compartilha_saldo = casa
// vê saldo/projeção da conta na tela de saldo projetado (novo, default off).

exports.up = (pgm) => {
  pgm.addColumns('cartao_casa_visibilidade', {
    compartilha_saldo: { type: 'boolean', notNull: true, default: false },
  });
};

exports.down = (pgm) => {
  pgm.dropColumns('cartao_casa_visibilidade', ['compartilha_saldo']);
};

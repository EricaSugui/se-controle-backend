# Visão de domínio — o modelo mental do produto

> Escrito em 2026-07-26 para servir de FONTE em conversas de negócio
> (inclusive com IAs externas ao repositório). Descreve o que o produto É
> hoje, em linguagem de negócio — sem detalhes de implementação. Kit
> recomendado para pensar negócio: este documento + `tenencia.md`
> (posicionamento) + `backlog.md` (o que existe e o que vem).

## A tese em uma frase

Planejamento financeiro **para a casa, não para o indivíduo** — a família
enxerga junta o que está comprometido, o que sobra e o que acontece se algo
mudar. Detalhes de marca e posicionamento em `tenencia.md`.

## As entidades que sustentam tudo

- **Casa** — a unidade central do sistema. Uma pessoa pode participar de
  várias casas (a própria, a dos pais que ela ajuda a custear), mas **as
  casas nunca se misturam**: gasto, relatório, acerto e dashboard são
  sempre de UMA casa. Cada casa tem seus admins e membros.
- **Pessoa ≠ usuário** — pessoas existem sem login (uma filha criança, uma
  irmã que ainda não entrou no app) e podem ganhar login depois, sem perder
  o histórico. Todo lançamento registra QUEM É o dono do fato (de quem é o
  gasto) separado de QUEM registrou.
- **Catálogos curados** — categorias (com ícone e cor), formas de pagamento
  e origens de receita são geridos centralmente, não pelos usuários; o app
  só os consome.
- **Cartões e contas** — os meios de pagamento têm dono (titular) e tipo:
  conta (débito/aplicação) ou cartão de crédito. Cartão de crédito gera
  **faturas** (fecham num dia, vencem noutro) que desaguam numa conta.

## O dinheiro em movimento

- **Compra** — o gasto. Tem casa, responsável (de quem é o gasto),
  categoria, meio de pagamento e pode ser parcelada. As parcelas caem ou
  na fatura do cartão (crédito) ou em datas próprias (débito/dinheiro).
- **Receita** — dinheiro que entra de verdade no orçamento da casa
  (salário, mesada). Reembolso entre pessoas NÃO é receita (ver acerto).

## Os dois eixos de leitura (conceito central do produto)

Toda pergunta financeira tem duas respostas legítimas, e o produto expõe
as duas:

- **Competência** — "para onde foi o dinheiro?": o gasto conta inteiro no
  mês em que foi decidido, mesmo parcelado em 10x.
- **Caixa** — "o que sai do bolso?": cada parcela conta no mês em que
  efetivamente desagua (na fatura, no débito).

Parceladas são a diferença visível: inteiras na competência, espalhadas no
caixa. Os totais convergem no acumulado.

## Contratos: o que se repete todo mês

- **Despesas fixas e receitas fixas** são contratos com vigência (aluguel,
  salário, mensalidade). Não se edita o valor de um contrato: **reajuste
  cria uma nova versão** encadeada à anterior — a história é preservada
  ("quanto era o aluguel em março?").
- **Exceções justificam ausências** — "a diarista não veio este mês" não é
  atraso, é exceção registrada. O status (em dia / atrasado) compara o
  esperado do contrato com o realizado + exceções.
- Comportamento ≠ classificação: o contrato diz o que se ESPERA; o que
  aconteceu vive nos lançamentos reais vinculados a ele.

## Custeio compartilhado e acerto de contas

Para casas geridas por mais de uma pessoa (ex.: filhas que custeiam a casa
da mãe):

- **Combinado** — percentual de custeio por casa+mês ("Karina banca 100%").
- **Exceção pontual** — uma compra específica pode ter rateio próprio
  ("esse remédio é por minha conta").
- **Acerto de contas** — uma conta corrente entre as pessoas: o sistema
  infere quem DESEMBOLSOU (titular do meio de pagamento usado) e quem
  DEVIA bancar (combinado + exceções), e o saldo diz quem deve quanto a
  quem. Reembolsos e adiantamentos são o mesmo registro; "acertado" é o
  saldo chegar a zero — não existe "marcar como pago".
- O acerto tem eixo próprio por casa (reembolsa pelo gasto do mês ou
  conforme sai do bolso), com exceção por compra (a geladeira em 10x que
  pinga parcela a parcela).

## As visões derivadas (ninguém digita resumo)

Tudo abaixo é CALCULADO dos lançamentos — nunca armazenado nem editável:

- **Dashboard** — o estado do mês por casa (gastos, receitas, minha parte
  pelo combinado), nos dois eixos.
- **Relatório de gastos** — a matriz mês × categoria × pessoa de uma casa:
  para onde foi o dinheiro, quem gasta com o quê, evolução no tempo.
- **Saldo projetado** — o futuro por conta: saldo base + receitas
  esperadas − parcelas, faturas e despesas fixas que vêm aí. Configuração
  incompleta gera AVISO (nunca bloqueia, nunca inventa número).
- **Fechamento mensal** — a consolidação do mês por casa.

## Princípios que valem para tudo

1. **Persiste-se o evento real, deriva-se o resto** — nada de totais
   digitados; visões são consequência dos fatos.
2. **Nada se apaga** — ciclo de vida é encerramento/desativação; história
   não se reescreve (por isso reajuste versiona em vez de editar).
3. **Avisos guiam, não bloqueiam** — dado incompleto vira aviso visível,
   nunca cálculo silenciosamente errado.
4. **A casa é soberana** — nenhuma visão mistura casas; autorização segue
   participação e papel na casa.
5. **Vocabulário de antecipação, não de culpa** — "saber antes", "enxergar
   o mês"; o dashboard é mapa, não tribunal (ver `tenencia.md`).

## O que ainda NÃO existe (não assumir em conversas)

O próximo grande passo é o **motor de cenários** ("posso comprar X?",
"e se a renda cair 20%?") — desenhado, não construído. A lista viva do que
foi entregue e do que está por vir é o `backlog.md`; as decisões técnicas
de API estão em `decisoes-superficie-api.md`.

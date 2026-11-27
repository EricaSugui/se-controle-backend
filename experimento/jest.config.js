// Testes do experimento, separados dos do produto (o jest.config.js da raiz
// só olha src/). Precisam do banco de medição: rode `npm run exp:test`, que
// recria o banco antes.
module.exports = {
  rootDir: __dirname,
  testEnvironment: 'node',
  testMatch: ['<rootDir>/test/**/*.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
  },
};

// As variáveis de ambiente NÃO são carregadas de arquivo aqui: localmente
// vêm dos scripts do package.json (dotenv -e .env.<ambiente>) e, em
// produção, do próprio Railway. Assim nenhum `.env` é lido por acidente.
import app from './app';

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

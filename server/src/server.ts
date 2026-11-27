import { createApp } from "./app.js";
import { connectDatabase } from "./config/database.js";
import { loadEnvironment } from "./config/env.js";

async function start() {
  const config = loadEnvironment();
  const database = await connectDatabase(config.MONGODB_URI).catch(() => {
    throw new Error("Não foi possível conectar ao MongoDB. Verifique a configuração, a rede e o acesso ao banco.");
  });

  const app = await createApp(database, config).catch(async () => {
    await database.destroy().catch(() => undefined);
    throw new Error("Não foi possível inicializar a autenticação e os índices do MongoDB.");
  });
  const server = app.listen(config.PORT, config.HOST, () => {
    console.log(`JARVIS API disponível na porta ${config.PORT}.`);
  });

  async function shutdown() {
    process.off("SIGINT", shutdown);
    process.off("SIGTERM", shutdown);
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await database.destroy().catch(() => {
      console.error("Não foi possível encerrar a conexão com o MongoDB.");
      process.exitCode = 1;
    });
  }

  server.once("error", () => {
    console.error("Não foi possível iniciar o servidor HTTP. Verifique o endereço e a porta configurados.");
    process.exitCode = 1;
    void shutdown();
  });
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch((error: Error) => {
  console.error(error.message);
  process.exitCode = 1;
});

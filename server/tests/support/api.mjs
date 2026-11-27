import { randomBytes } from "node:crypto";
import { once } from "node:events";
import { MongoMemoryServer } from "mongodb-memory-server-core";
import { createApp } from "../../dist/app.js";
import { connectDatabase } from "../../dist/config/database.js";
import { loadEnvironment } from "../../dist/config/env.js";

export async function startTestApi() {
  const mongo = await MongoMemoryServer.create({
    instance: { ip: "127.0.0.1", args: ["--setParameter", "ttlMonitorEnabled=false"] },
  });
  const config = loadEnvironment({
    NODE_ENV: "test",
    MONGODB_URI: mongo.getUri("jarvis_test"),
    JWT_ACCESS_SECRET: randomBytes(32).toString("hex"),
  });
  let connection;
  let server;

  async function close() {
    if (server?.listening) await new Promise((resolve) => server.close(resolve));
    try {
      await connection?.destroy();
    } finally {
      await mongo.stop();
    }
  }

  try {
    connection = await connectDatabase(config.MONGODB_URI);
    const app = await createApp(connection, config);
    server = app.listen(0, "127.0.0.1");
    await once(server, "listening");
    const origin = `http://127.0.0.1:${server.address().port}`;
    return { mongo, config, connection, origin, close };
  } catch (error) {
    await close();
    throw error;
  }
}

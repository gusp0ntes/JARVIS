import mongoose, { type Connection } from "mongoose";

export function isDuplicateKey(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && error.code === 11000);
}

export async function connectDatabase(uri: string): Promise<Connection> {
  const connection = mongoose.createConnection(uri, {
    bufferCommands: false,
    connectTimeoutMS: 5000,
    serverSelectionTimeoutMS: 5000,
  });

  try {
    await connection.asPromise();
    await pingDatabase(connection);
    return connection;
  } catch (error) {
    await connection.destroy().catch(() => undefined);
    throw error;
  }
}

export async function pingDatabase(connection: Connection): Promise<void> {
  if (connection.readyState !== mongoose.ConnectionStates.connected || !connection.db) {
    throw new Error("MongoDB indisponível.");
  }
  await connection.db.command({ ping: 1 }, { signal: AbortSignal.timeout(1500) });
}

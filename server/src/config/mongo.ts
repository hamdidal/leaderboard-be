import { MongoClient, Db } from 'mongodb';
import { env } from './env';

let client: MongoClient;
let db: Db;

export async function connectMongo(): Promise<Db> {
  if (db) return db;
  client = new MongoClient(env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
  await client.connect();
  db = client.db();

  await db
    .collection('reward_audit')
    .createIndex({ weekId: 1 }, { unique: true, background: true });

  await db
    .collection('earn_events')
    .createIndex({ weekId: 1, createdAt: -1 }, { background: true });

  await db
    .collection('earn_events')
    .dropIndex('idempotencyKey_1')
    .catch(() => undefined);

  return db;
}

export function getMongoDb(): Db {
  if (!db) {
    throw new Error('MongoDB not connected. Call connectMongo() first.');
  }
  return db;
}

export async function disconnectMongo(): Promise<void> {
  if (client) {
    await client.close();
  }
}

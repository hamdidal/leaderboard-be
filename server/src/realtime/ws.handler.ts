import type { FastifyInstance } from 'fastify';
import type WebSocket from 'ws';
import websocket from '@fastify/websocket';
import { redisSubscriber } from '../config/redis';
import { RedisKeys } from '../lib/redis-keys';
import { leaderboardRepo } from '../modules/leaderboard/leaderboard.repo';

const channelClients = new Map<string, Set<WebSocket>>();

function addClientToChannel(channel: string, client: WebSocket): void {
  let set = channelClients.get(channel);
  if (!set) {
    set = new Set();
    channelClients.set(channel, set);
  }
  set.add(client);
}

function removeClientFromChannel(channel: string, client: WebSocket): void {
  const set = channelClients.get(channel);
  if (!set) return;
  set.delete(client);
  if (set.size === 0) {
    channelClients.delete(channel);
  }
}

const channelRefCounts = new Map<string, number>();

async function subscribeChannel(channel: string): Promise<void> {
  const count = channelRefCounts.get(channel) ?? 0;
  channelRefCounts.set(channel, count + 1);
  if (count === 0) {
    await redisSubscriber.subscribe(channel);
  }
}

async function unsubscribeChannel(channel: string): Promise<void> {
  const count = channelRefCounts.get(channel) ?? 0;
  if (count <= 1) {
    channelRefCounts.delete(channel);
    await redisSubscriber.unsubscribe(channel);
  } else {
    channelRefCounts.set(channel, count - 1);
  }
}

export async function registerWebSocket(app: FastifyInstance): Promise<void> {
  await app.register(websocket);

  redisSubscriber.on('message', (channel, message) => {
    const clients = channelClients.get(channel);
    if (!clients) return;
    for (const client of clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  });

  app.get('/live', { websocket: true }, async (socket, request) => {
    const weekId =
      (request.query as { weekId?: string }).weekId ?? (await leaderboardRepo.getCurrentWeekId());

    const channel = RedisKeys.pubSubChannel(weekId);
    const ws = socket as unknown as WebSocket;

    addClientToChannel(channel, ws);
    await subscribeChannel(channel);

    socket.on('close', async () => {
      removeClientFromChannel(channel, ws);
      await unsubscribeChannel(channel);
    });

    socket.send(JSON.stringify({ type: 'connected', weekId }));
  });
}

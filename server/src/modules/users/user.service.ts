import { prisma } from '../../config/prisma';
import { resolveDisplayName } from '../../lib/display-name';
import { leaderboardRepo } from '../leaderboard/leaderboard.repo';

export async function ensureUserExists(userId: string): Promise<void> {
  const meta = await leaderboardRepo.getUserMeta(userId);
  const displayName = resolveDisplayName(userId, meta.displayName);
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      displayName,
      avatarUrl: meta.avatarUrl,
    },
    update: {
      displayName,
      avatarUrl: meta.avatarUrl ?? undefined,
    },
  });
}

export async function ensureUsersExist(userIds: string[]): Promise<void> {
  if (userIds.length === 0) return;

  const unique = [...new Set(userIds)];
  const metaMap = await leaderboardRepo.getUsersMetaBatch(unique);

  await Promise.all(
    unique.map((id) => {
      const meta = metaMap.get(id)!;
      const displayName = resolveDisplayName(id, meta.displayName);
      return prisma.user.upsert({
        where: { id },
        create: {
          id,
          displayName,
          avatarUrl: meta.avatarUrl,
        },
        update: {
          displayName,
          avatarUrl: meta.avatarUrl ?? undefined,
        },
      });
    }),
  );
}

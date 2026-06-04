import { createHash } from 'crypto';
import { faker } from '@faker-js/faker';

export function isGenericPlayerName(name: string): boolean {
  return /^Player [0-9a-f-]{8}$/i.test(name.trim());
}

export function generateDisplayName(): string {
  return faker.number.int({ max: 1 }) === 0 ? faker.person.fullName() : faker.internet.username();
}

export function displayNameForUserId(userId: string): string {
  const seed = createHash('sha256').update(userId).digest().readUInt32BE(0);
  faker.seed(seed);
  try {
    return faker.number.int({ max: 1 }) === 0 ? faker.person.fullName() : faker.internet.username();
  } finally {
    faker.seed();
  }
}

export function resolveDisplayName(
  userId: string,
  ...candidates: (string | null | undefined)[]
): string {
  for (const candidate of candidates) {
    if (candidate && !isGenericPlayerName(candidate)) {
      return candidate;
    }
  }
  return displayNameForUserId(userId);
}

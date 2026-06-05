export function getIsoWeekId(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}W${String(weekNo).padStart(2, '0')}`;
}

export function getWeekBounds(weekId: string): { startsAt: Date; endsAt: Date } {
  const match = weekId.match(/^(\d{4})W(\d{2})$/);
  if (!match) {
    throw new Error(`Invalid week id: ${weekId}`);
  }
  const year = parseInt(match[1], 10);
  const week = parseInt(match[2], 10);
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const mondayWeek1 = new Date(jan4);
  mondayWeek1.setUTCDate(jan4.getUTCDate() - dayOfWeek + 1);
  const startsAt = new Date(mondayWeek1);
  startsAt.setUTCDate(mondayWeek1.getUTCDate() + (week - 1) * 7);
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(startsAt.getUTCDate() + 7);
  return { startsAt, endsAt };
}

export function secondsUntil(date: Date): number {
  return Math.max(0, Math.floor((date.getTime() - Date.now()) / 1000));
}

export function getNextIsoWeekId(currentWeekId: string): string {
  const { endsAt } = getWeekBounds(currentWeekId);
  return getIsoWeekId(new Date(endsAt.getTime() + 86_400_000));
}

export function getPreviousIsoWeekId(currentWeekId: string): string {
  const { startsAt } = getWeekBounds(currentWeekId);
  return getIsoWeekId(new Date(startsAt.getTime() - 86_400_000));
}

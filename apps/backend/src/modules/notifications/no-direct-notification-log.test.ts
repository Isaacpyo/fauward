import { readFile, readdir } from 'node:fs/promises';
import { relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// D6 gate (ACC-NOT-3): only the notification worker writes NotificationLog. Everything else enqueues through
// sendEmail / sendSms / PlatformNotifier / notifyCustomer, so a log row always means a delivery attempt happened
// (the C1 call sites wrote QUEUED rows that nothing ever sent).

const ALLOWED = new Set(['modules/notifications/notifications.worker.ts']);
const DIRECT_WRITE = /\.notificationLog\.(create|createMany|upsert|update|updateMany)\s*\(/g;
const RAW_INSERT = /insert\s+into\s+"?notification_logs"?/gi;

export function findDirectNotificationLogWrites(source: string) {
  return [...source.matchAll(DIRECT_WRITE), ...source.matchAll(RAW_INSERT)].map((match) => match[0].trim());
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const full = resolve(dir, entry.name);
      if (entry.isDirectory()) return sourceFiles(full);
      return /\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name) ? [full] : [];
    })
  );
  return nested.flat();
}

describe('no direct NotificationLog writes (D6)', () => {
  it('ACC-NOT-3 no source file outside the notification worker writes NotificationLog', async () => {
    const root = resolve(process.cwd(), 'src');
    const offenders: string[] = [];
    for (const file of await sourceFiles(root)) {
      const path = relative(root, file).replaceAll('\\', '/');
      if (ALLOWED.has(path)) continue;
      const found = findDirectNotificationLogWrites(await readFile(file, 'utf8'));
      if (found.length > 0) offenders.push(`${path}: ${found.join(', ')}`);
    }
    expect(offenders).toEqual([]);
  });

  it('ACC-NOT-3 self-test: the old QUEUED-row pattern is caught', () => {
    expect(findDirectNotificationLogWrites("await tx.notificationLog.create({ data: { status: 'QUEUED' } });")).toEqual(['.notificationLog.create(']);
    expect(findDirectNotificationLogWrites('await app.prisma.notificationLog.createMany({ data: rows });')).toEqual(['.notificationLog.createMany(']);
    expect(findDirectNotificationLogWrites('await app.prisma.notificationLog.findMany({ where: {} });')).toEqual([]);
    expect(findDirectNotificationLogWrites('insert into notification_logs (id) values ($1)')).toEqual(['insert into notification_logs']);
  });
});

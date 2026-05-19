import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('internal route RBAC matrix', () => {
  it('does not guard mutating internal routes with read permissions', async () => {
    const routeFiles = [
      'src/modules/internal/console-phases.routes.ts',
      'src/modules/internal/iam.routes.ts',
      'src/modules/internal/billing.routes.ts',
      'src/modules/internal/customer360.routes.ts',
      'src/modules/internal/audit.routes.ts'
    ];

    const violations: string[] = [];
    for (const routeFile of routeFiles) {
      const source = await readFile(resolve(process.cwd(), routeFile), 'utf8');
      const lines = source.split(/\r?\n/);
      for (const [index, line] of lines.entries()) {
        if (!/app\.(post|patch|put|delete)\(/.test(line)) continue;
        const permissions = [...line.matchAll(/(?:writePre|requireInternalPermission)\('([^']+)'\)/g)].map((match) => match[1]);
        for (const permission of permissions) {
          if (permission.endsWith('.read')) violations.push(`${routeFile}:${index + 1}: ${permission}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });
});

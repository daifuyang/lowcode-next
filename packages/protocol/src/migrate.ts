import type { PageSchema } from './schema';

/**
 * schema 版本迁移。
 *
 * v1 只有注册表和一个空迁移示例；真正用到时再加具体规则。
 * 原则：schema 永远带 version，迁移单向、可链式、幂等。
 */

export interface Migration {
  from: string;
  to: string;
  migrate(schema: PageSchema): PageSchema;
}

const registry: Migration[] = [
  {
    from: '1.0.0',
    to: '1.0.1',
    // 空迁移示例：保留结构，便于后续加字段
    migrate: (schema) => schema,
  },
];

export function registerMigration(migration: Migration): void {
  registry.push(migration);
}

export class MigrationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MigrationError';
  }
}

/**
 * 把 schema 迁移到 targetVersion。
 * 找不到路径时抛错，而不是静默返回旧版本。
 */
export function migrate(schema: PageSchema, targetVersion: string): PageSchema {
  let current = schema;
  let guard = 0;

  while (current.version !== targetVersion) {
    if (++guard > 100) {
      throw new MigrationError(`迁移链路疑似循环，停在 ${current.version}`);
    }
    const next = registry.find((m) => m.from === current.version);
    if (!next) {
      throw new MigrationError(
        `找不到从 ${current.version} 到 ${targetVersion} 的迁移路径`,
      );
    }
    current = { ...next.migrate(current), version: next.to };
  }

  return current;
}

export const CURRENT_SCHEMA_VERSION = '1.0.1';

import type { PGlite, Results } from '@electric-sql/pglite';

export interface QueryAsContext {
  pgRole?: 'anon' | 'authenticated' | 'service_role';
  role?: 'anon' | 'authenticated' | 'service_role';
  userId?: string;
  email?: string;
  aal?: 'aal1' | 'aal2';
  appRole?: 'client' | 'admin';
}

export interface TestUserRecord {
  id: string;
  email: string;
  role: 'client' | 'admin';
  isActive: boolean;
  mfaEnforced: boolean;
  fullName: string;
}

export interface DisposablePostgres {
  db: PGlite;
  appliedMigrations: string[];
  applyMigrationsAfter(afterPrefix: string): Promise<string[]>;
  createTestUser(input: {
    id?: string;
    email: string;
    fullName?: string;
    role?: 'client' | 'admin';
    isActive?: boolean;
    mfaEnforced?: boolean;
  }): Promise<TestUserRecord>;
  queryAs<T = Record<string, unknown>>(
    context: QueryAsContext,
    sql: string,
    params?: unknown[]
  ): Promise<Results<T>>;
  close(): Promise<void>;
}

export function listMigrationFiles(
  rootDir?: string,
  options?: { maxPrefix?: string | null }
): Array<{ name: string; path: string }>;

export function createDisposablePostgres(options?: {
  rootDir?: string;
  maxMigrationPrefix?: string | null;
  applySeed?: boolean;
}): Promise<DisposablePostgres>;

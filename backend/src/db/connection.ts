import Database from 'better-sqlite3';
import { lstatSync, mkdirSync, mkdtempSync, realpathSync, rmdirSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const DEFAULT_DATABASE_PATH = fileURLToPath(new URL('../../data/expense-tracker.sqlite', import.meta.url));
const testFiles = new Map<string, string>();

function verifyTestFile(filename: string): string {
  const path = resolve(filename);
  const directory = testFiles.get(path);
  if (!directory || realpathSync(dirname(path)) !== directory) {
    throw new Error('Test database path must be allocated by createTestDatabaseFile');
  }
  const stat = lstatSync(path, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
      throw new Error('Test database must be a private regular file');
    }
  }
  return path;
}

/** Allocate a new, private test file path; dispose only after closing its connections. */
export function createTestDatabaseFile(): { filename: string; dispose: () => void } {
  const directory = realpathSync(mkdtempSync(join(tmpdir(), 'expense-tracker-test-')));
  const filename = join(directory, 'test.sqlite');
  testFiles.set(filename, directory);
  return {
    filename,
    dispose() {
      verifyTestFile(filename);
      for (const suffix of ['', '-journal', '-wal', '-shm']) {
        const file = filename + suffix;
        const stat = lstatSync(file, { throwIfNoEntry: false });
        if (stat) {
          if (!stat.isFile() || stat.isSymbolicLink() || stat.nlink !== 1) {
            throw new Error('Refusing to remove an unexpected test artifact');
          }
          unlinkSync(file);
        }
      }
      // Non-recursive: never remove unrelated files if the directory was altered.
      rmdirSync(directory);
      testFiles.delete(filename);
    },
  };
}

export interface ConnectionOptions {
  mode?: 'development' | 'test';
  filename?: string;
}

/**
 * Test mode ignores DATABASE_PATH and permits only memory or private allocated files.
 * Development relative paths resolve from the backend directory, independent of cwd.
 */
export function openDatabase(options: ConnectionOptions = {}): Database.Database {
  const mode = options.mode ?? 'development';
  let filename: string;
  if (mode === 'test') {
    filename = options.filename ?? ':memory:';
    if (filename !== ':memory:') filename = verifyTestFile(filename);
  } else {
    if (process.env['NODE_ENV'] === 'test' || process.env['VITEST']) {
      throw new Error('Development database access is forbidden in tests');
    }
    const configured = options.filename ?? process.env['DATABASE_PATH'];
    if (configured !== undefined && (configured.trim() === '' || configured === ':memory:')) {
      throw new Error('Development requires a persistent database path');
    }
    filename = configured === undefined ? DEFAULT_DATABASE_PATH
      : resolve(dirname(dirname(DEFAULT_DATABASE_PATH)), configured);
    if (testFiles.has(filename) || dirname(filename).includes('expense-tracker-test-')) {
      throw new Error('Development cannot use a test database path');
    }
    mkdirSync(dirname(filename), { recursive: true });
  }

  const db = new Database(filename);
  try {
    db.pragma('foreign_keys = ON');
    if (db.pragma('foreign_keys', { simple: true }) !== 1) throw new Error('Foreign keys must be enabled');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}

import type Database from 'better-sqlite3';
import type { TransactionRequest, TransactionType } from '../validation/transactions.js';
import type { TransactionQuery } from '../validation/queries.js';

export interface Transaction extends TransactionRequest {
  id: number;
  categoryName: string;
  createdAt: string;
  updatedAt: string;
}

const TRANSACTION_COLUMNS = `t.id, t.type, t.amount_cents AS amountCents, t.category_id AS categoryId,
  c.name AS categoryName, t.transaction_date AS date, t.note,
  t.created_at AS createdAt, t.updated_at AS updatedAt`;
const TRANSACTION_FROM = 'FROM transactions t JOIN categories c ON c.id = t.category_id AND c.type = t.type';

export function findTransaction(db: Database.Database, id: number): Transaction | undefined {
  return db.prepare(`SELECT ${TRANSACTION_COLUMNS} ${TRANSACTION_FROM}
    WHERE t.id = ?`).get(id) as Transaction | undefined;
}

export interface TransactionPage {
  data: Transaction[];
  meta: { page: number; pageSize: number; total: number; totalPages: number };
}

/** Caller owns a consistent read transaction spanning category lookup, count and data. */
export function listTransactions(db: Database.Database, query: TransactionQuery): TransactionPage {
  const conditions: string[] = [];
  const parameters: Record<string, string | number> = {};
  if (query.type !== undefined) { conditions.push('t.type = @type'); parameters['type'] = query.type; }
  if (query.categoryId !== undefined) { conditions.push('t.category_id = @categoryId'); parameters['categoryId'] = query.categoryId; }
  if (query.startDate !== undefined) { conditions.push('t.transaction_date >= @startDate'); parameters['startDate'] = query.startDate; }
  if (query.endDate !== undefined) { conditions.push('t.transaction_date <= @endDate'); parameters['endDate'] = query.endDate; }
  if (query.q !== undefined) {
    if (query.q.includes('\0')) {
      // Stored notes cannot contain NUL. Avoid SQLite LIKE's NUL truncation behavior.
      conditions.push('0 = 1');
    } else {
      // SQLite's built-in lower folds ASCII only. Escape the escape character first.
      conditions.push("lower(t.note) LIKE lower(@search) ESCAPE '\\'");
      parameters['search'] = `%${query.q.replace(/[\\%_]/g, '\\$&')}%`;
    }
  }
  const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  const count = db.prepare(`SELECT COUNT(*) AS total ${TRANSACTION_FROM} ${where}`)
    .safeIntegers(true).get(parameters) as { total: bigint };
  const total = Number(count.total);
  if (!Number.isSafeInteger(total)) throw new Error('Matching transaction count is unsafe');
  const pageSize = BigInt(query.pageSize);
  const totalPages = Number((count.total + pageSize - 1n) / pageSize);
  const offset = (BigInt(query.page) - 1n) * pageSize;
  const data = offset >= count.total ? [] : db.prepare(`SELECT ${TRANSACTION_COLUMNS} ${TRANSACTION_FROM} ${where}
    ORDER BY t.transaction_date DESC, t.id DESC LIMIT @limit OFFSET @offset`)
    .all({ ...parameters, limit: query.pageSize, offset }) as Transaction[];
  return { data, meta: { page: query.page, pageSize: query.pageSize, total, totalPages } };
}

/** Caller owns the write transaction and all validation. */
export function insertTransaction(db: Database.Database, input: TransactionRequest): number {
  const inserted = db.prepare(`INSERT INTO transactions(type, amount_cents, category_id, transaction_date, note)
    VALUES (@type, @amountCents, @categoryId, @date, @note)`).run(input);
  const id = Number(inserted.lastInsertRowid);
  if (!Number.isSafeInteger(id) || id < 1) throw new Error('Invalid stored transaction ID');
  return id;
}

/** BigInt mode prevents aggregate precision loss before the service checks safety. */
export function monetaryTotals(db: Database.Database): { type: TransactionType; total: bigint }[] {
  return db.prepare('SELECT type, SUM(amount_cents) AS total FROM transactions GROUP BY type')
    .safeIntegers(true).all() as { type: TransactionType; total: bigint }[];
}

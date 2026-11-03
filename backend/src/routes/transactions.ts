import type Database from 'better-sqlite3';
import { Router } from 'express';
import { NotFoundError, RequestValidationError, validateInput } from '../middleware/errors.js';
import { findTransaction } from '../repositories/transactions.js';
import { AggregateOverflowError, createTransaction, deleteTransaction, replaceTransaction, searchTransactions, TransactionCategoryError, TransactionNotFoundError } from '../services/transactions.js';
import { parsePositiveId } from '../validation/ids.js';
import { validateRequestObject } from '../validation/request.js';
import { validateTransactionRequest } from '../validation/transactions.js';
import { validateTransactionQuery } from '../validation/queries.js';

export function createTransactionRouter(db: Database.Database): Router {
  const router = Router();
  router.get('/', (request, response) => {
    const query = validateInput(() => validateTransactionQuery(request.query));
    try {
      response.json(searchTransactions(db, query));
    } catch (error) {
      if (error instanceof TransactionCategoryError) throw new RequestValidationError('categoryId');
      throw error;
    }
  });
  router.post('/', (request, response) => {
    validateInput(() => validateRequestObject(request.query, []));
    const input = validateInput(() => validateTransactionRequest(request.body));
    try {
      const transaction = createTransaction(db, input);
      response.location(`/api/transactions/${transaction.id}`).status(201).json({ data: transaction });
    } catch (error) {
      if (error instanceof TransactionCategoryError) throw new RequestValidationError('categoryId');
      if (error instanceof AggregateOverflowError) throw new RequestValidationError('amountCents');
      throw error;
    }
  });
  router.get('/:id', (request, response) => {
    validateInput(() => validateRequestObject(request.query, []));
    const id = validateInput(() => parsePositiveId(request.params['id']));
    const transaction = findTransaction(db, id);
    if (!transaction) throw new NotFoundError();
    response.json({ data: transaction });
  });
  router.put('/:id', (request, response) => {
    validateInput(() => validateRequestObject(request.query, []));
    const id = validateInput(() => parsePositiveId(request.params['id']));
    const input = validateInput(() => validateTransactionRequest(request.body));
    try {
      response.json({ data: replaceTransaction(db, id, input) });
    } catch (error) {
      if (error instanceof TransactionNotFoundError) throw new NotFoundError();
      if (error instanceof TransactionCategoryError) throw new RequestValidationError('categoryId');
      if (error instanceof AggregateOverflowError) throw new RequestValidationError('amountCents');
      throw error;
    }
  });
  router.delete('/:id', (request, response) => {
    validateInput(() => validateRequestObject(request.query, []));
    const id = validateInput(() => parsePositiveId(request.params['id']));
    try {
      deleteTransaction(db, id);
      response.status(204).end();
    } catch (error) {
      if (error instanceof TransactionNotFoundError) throw new NotFoundError();
      throw error;
    }
  });
  return router;
}

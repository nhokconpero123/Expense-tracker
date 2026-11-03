import { createServer } from 'node:http';
import express from 'express';
import type { Request, Response } from 'express';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createApp } from '../app.js';
import { validateMoneyCents } from '../validation/money.js';
import { validateTransactionRequest } from '../validation/transactions.js';
import { errorHandler, NotFoundError, notFound, RequestValidationError, validateInput } from './errors.js';

const sensitive = 'PRIVATE_NOTE SELECT * FROM transactions C:\\private\\database.sqlite /private/secret';
const app = express();
app.use(express.json({ limit: 16 * 1024 }));
app.post('/schema', (req, res) => res.json(validateInput(() => validateTransactionRequest(req.body))));
app.post('/field', (req, res) => res.json({ amountCents: validateInput(() => validateMoneyCents(req.body.amountCents), 'amountCents') }));
app.post('/size', (_req, res) => res.json({ ok: true }));
app.get('/missing', () => { throw new NotFoundError(); });
app.get('/internal', () => { throw new Error(sensitive); });
app.get('/type-error', () => { throw new TypeError(sensitive); });
app.get('/range-error', () => { throw new RangeError(sensitive); });
app.get('/async', async () => { throw new Error(sensitive); });
app.get('/fake-status', () => { throw { status: 400, message: sensitive }; });
app.use(notFound);
app.use(errorHandler);

const server = createServer(app);
const productionServer = createServer(createApp());

beforeAll(async () => {
  for (const listener of [server, productionServer]) {
    await new Promise<void>((resolve, reject) => {
      listener.once('error', reject);
      listener.listen(0, '127.0.0.1', resolve);
    });
  }
});

afterAll(async () => {
  for (const listener of [server, productionServer]) {
    await new Promise<void>((resolve, reject) => {
      listener.close((error) => error ? reject(error) : resolve());
    });
  }
});

function expectSafe(response: request.Response, status: number, code: string, message: string) {
  expect(response.status).toBe(status);
  expect(response.headers['content-type']).toMatch(/application\/json/);
  expect(response.body).toMatchObject({ error: { code, message } });
  expect(Object.keys(response.body)).toEqual(['error']);
  for (const fragment of ['PRIVATE_NOTE', 'SELECT', 'private', 'database.sqlite', 'stack', 'SyntaxError']) {
    expect(response.text).not.toContain(fragment);
  }
}

describe('HTTP error boundary', () => {
  it.each(['{"note":"PRIVATE_NOTE",', '{', 'null', '"PRIVATE_NOTE"'])(
    'returns safe 400 for malformed or non-container JSON %s', async (body) => {
      const response = await request(productionServer).post('/unknown').type('json').send(body);
      expectSafe(response, 400, 'INVALID_JSON', 'Request body must contain valid JSON.');
      expect(response.body.error.fields).toBeUndefined();
    },
  );
  it.each(['/unknown', '/api/transactions', '/PRIVATE_NOTE?note=PRIVATE_NOTE'])(
    'returns safe JSON 404 for unknown route %s', async (path) => {
      const response = await request(productionServer).get(path);
      expectSafe(response, 404, 'NOT_FOUND', 'Resource not found.');
    },
  );
  it('returns 404 for an explicitly missing resource', async () => {
    expectSafe(await request(server).get('/missing'), 404, 'NOT_FOUND', 'Resource not found.');
  });
  it('accepts exactly 16 KiB of JSON', async () => {
    const body = JSON.stringify({ note: 'a'.repeat(16 * 1024 - 11) });
    expect(Buffer.byteLength(body)).toBe(16 * 1024);
    expect((await request(server).post('/size').type('json').send(body)).status).toBe(200);
  });
  it.each(['a', 'é'])('rejects oversized JSON using bytes for %s', async (character) => {
    const body = JSON.stringify({ note: sensitive + character.repeat(16 * 1024) });
    const response = await request(productionServer).post('/unknown').type('json').send(body);
    expectSafe(response, 413, 'PAYLOAD_TOO_LARGE', 'JSON request body must not exceed 16 KiB.');
  });
  it('rejects a body one byte over the limit', async () => {
    const body = JSON.stringify({ note: 'a'.repeat(16 * 1024 - 10) });
    expect(Buffer.byteLength(body)).toBe(16 * 1024 + 1);
    expectSafe(await request(server).post('/size').type('json').send(body),
      413, 'PAYLOAD_TOO_LARGE', 'JSON request body must not exceed 16 KiB.');
  });
  it.each([0, '1', null, 1.5])('adapts validator errors with safe field messages for %j', async (amountCents) => {
    const response = await request(server).post('/field').send({ amountCents, note: sensitive });
    expectSafe(response, 400, 'VALIDATION_ERROR', 'Request validation failed.');
    expect(response.body).toEqual({ error: { code: 'VALIDATION_ERROR', message: 'Request validation failed.',
      fields: { amountCents: 'Enter integer cents from 1 to 100000000.' } } });
  });
  it('adapts a composed T02c validator without reflecting invalid fields', async () => {
    const response = await request(server).post('/schema').send({ type: sensitive, note: sensitive });
    expectSafe(response, 400, 'VALIDATION_ERROR', 'Request validation failed.');
    expect(response.body.error.fields).toBeUndefined();
  });
  it('passes valid schema requests through unchanged normalization', async () => {
    const response = await request(server).post('/schema').send({ type: 'income', amountCents: 1, categoryId: 1, date: '9999-12-31' });
    expect(response.status).toBe(200);
    expect(response.body.note).toBe('');
  });
  it.each(['/internal', '/type-error', '/range-error', '/async', '/fake-status'])(
    'returns safe 500 and safe diagnostics for %s', async (path) => {
      const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
      try {
        const response = await request(server).get(path).query({ note: sensitive });
        expectSafe(response, 500, 'INTERNAL_ERROR', 'An unexpected error occurred.');
        expect(logger.mock.calls).toEqual([['HTTP request failed', { code: 'INTERNAL_ERROR' }]]);
      } finally { logger.mockRestore(); }
    },
  );
  it('does not log validation or parser request bodies', async () => {
    const logger = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      await request(server).post('/field').send({ amountCents: sensitive, note: sensitive });
      await request(productionServer).post('/unknown').type('json').send('{"note":"PRIVATE_NOTE",');
      expect(logger).not.toHaveBeenCalled();
    } finally { logger.mockRestore(); }
  });
  it('preserves the real health endpoint', async () => {
    const response = await request(productionServer).get('/api/health');
    expect(response.status).toBe(200);
    expect(response.body).toEqual({ data: { status: 'ok' } });
    expect(response.headers['x-powered-by']).toBeUndefined();
  });
});

describe('error adapter and already-started responses', () => {
  it('does not swallow unexpected validator failures', () => {
    const error = new Error(sensitive);
    expect(() => validateInput(() => { throw error; })).toThrow(error);
  });
  it('discards raw validator messages', () => {
    expect(() => validateInput(() => { throw new TypeError(sensitive); }, 'note'))
      .toThrow('Request validation failed.');
  });
  it('delegates a sanitized error when headers have already been sent', () => {
    const next = vi.fn<(error?: unknown) => void>();
    errorHandler(new Error(sensitive), {} as Request, { headersSent: true } as Response, next);
    expect(next).toHaveBeenCalledOnce();
    expect(next.mock.calls[0]?.[0]).toBeInstanceOf(Error);
    expect(next.mock.calls[0]?.[0]).toMatchObject({ message: 'Internal server error.' });
  });
  it('constructs a controlled validation error', () => {
    expect(new RequestValidationError('note').field).toBe('note');
  });
});

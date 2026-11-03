import type { ErrorRequestHandler, RequestHandler } from 'express';

const FIELD_MESSAGES = {
  type: 'Choose income or expense.',
  amountCents: 'Enter integer cents from 1 to 100000000.',
  categoryId: 'Enter a positive safe-integer category ID.',
  date: 'Enter a valid YYYY-MM-DD date from 1900 through 9999.',
  note: 'Enter a string of at most 500 characters after trimming.',
  month: 'Enter a valid YYYY-MM month from 1900 through 9999.',
  startDate: 'Enter a valid start date not later than the end date.',
  endDate: 'Enter a valid end date not earlier than the start date.',
  q: 'Enter a search string of at most 100 characters after trimming.',
  page: 'Enter a positive safe-integer page number.',
  pageSize: 'Enter a page size from 1 to 100.',
} as const;

export type ValidationField = keyof typeof FIELD_MESSAGES;

/** Only fixed public messages are exposed; never pass user content as a field. */
export class RequestValidationError extends Error {
  constructor(readonly field?: ValidationField) {
    super('Request validation failed.');
    this.name = 'RequestValidationError';
  }
}

export class NotFoundError extends Error {
  constructor() {
    super('Resource not found.');
    this.name = 'NotFoundError';
  }
}

/**
 * Adapt only a pure T02a–T02c validator invocation to an HTTP validation error.
 * Do not wrap business logic: unrelated TypeError/RangeError must remain 500s.
 * Raw validator messages are deliberately discarded; field context is optional.
 */
export function validateInput<T>(validate: () => T, field?: ValidationField): T {
  try {
    return validate();
  } catch (error: unknown) {
    if (error instanceof TypeError || error instanceof RangeError) {
      throw new RequestValidationError(field);
    }
    throw error;
  }
}

export const notFound: RequestHandler = (_request, _response, next) => {
  next(new NotFoundError());
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, next) => {
  if (response.headersSent) {
    // The response cannot be replaced. Delegate a sanitized error for connection cleanup.
    next(new Error('Internal server error.'));
    return;
  }

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'An unexpected error occurred.';
  let fields: Record<string, string> | undefined;

  if (error instanceof RequestValidationError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed.';
    if (typeof error.field === 'string' && Object.hasOwn(FIELD_MESSAGES, error.field)) {
      fields = { [error.field]: FIELD_MESSAGES[error.field] };
    }
  } else if (error instanceof NotFoundError) {
    status = 404;
    code = 'NOT_FOUND';
    message = 'Resource not found.';
  } else if (error instanceof URIError && 'status' in error && error.status === 400) {
    // Express marks malformed percent-encoded route parameters as bad requests.
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Request validation failed.';
  } else if (error instanceof Error && 'type' in error && 'status' in error) {
    if (error.type === 'entity.too.large' && error.status === 413) {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'JSON request body must not exceed 16 KiB.';
    } else if (error instanceof SyntaxError && error.type === 'entity.parse.failed' && error.status === 400) {
      status = 400;
      code = 'INVALID_JSON';
      message = 'Request body must contain valid JSON.';
    }
  }

  if (status === 500) {
    // Safe diagnostic marker only: never log the error, URL, body, or notes.
    console.error('HTTP request failed', { code: 'INTERNAL_ERROR' });
  }
  response.status(status).json({ error: { code, message, ...(fields ? { fields } : {}) } });
};

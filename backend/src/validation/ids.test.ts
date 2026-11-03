import { describe, expect, it } from 'vitest';
import { parsePositiveId, validatePositiveId } from './ids.js';

describe('validatePositiveId', () => {
  it.each([1, 42, Number.MAX_SAFE_INTEGER])('accepts positive safe ID %s', (value) => {
    expect(validatePositiveId(value)).toBe(value);
  });
  it.each([0, -0, -1, 0.5, 1.5, NaN, Infinity, -Infinity,
    Number.MAX_SAFE_INTEGER + 1, Number.MIN_SAFE_INTEGER])('rejects invalid numeric ID %s', (value) => {
    expect(() => validatePositiveId(value)).toThrow(RangeError);
  });
  it.each(['1', null, undefined, [], [1], {}, true, 1n, new Number(1)])(
    'rejects wrong numeric ID type %s', (value) => {
      expect(() => validatePositiveId(value)).toThrow(TypeError);
    },
  );
});

describe('parsePositiveId', () => {
  it.each([['1', 1], ['42', 42], ['9007199254740991', Number.MAX_SAFE_INTEGER]] as const)(
    'parses canonical ID %s', (input, expected) => {
      expect(parsePositiveId(input)).toBe(expected);
    },
  );
  it.each(['', '0', '00', '01', '+1', '-1', '1.0', '1.5', '.1', '1.', '1e3', '1E3',
    '0x10', '0b10', '1_000', '1,000', '1abc', 'NaN', 'Infinity', ' 1', '1 ', '1\n',
    '1\r\n', '\t1', '1\t', '\u00a01', '1\u00a0', '1 2', '１', '١', '1\0',
    '9007199254740992', '9007199254740993', '9'.repeat(400)])(
    'rejects malformed or unsafe ID %j', (input) => {
      expect(() => parsePositiveId(input)).toThrow(RangeError);
    },
  );
  it.each([1, 0, NaN, Infinity, null, undefined, [], ['1'], {}, true, 1n, new String('1')])(
    'rejects wrong path/query ID type %s', (value) => {
      expect(() => parsePositiveId(value)).toThrow(TypeError);
    },
  );
});

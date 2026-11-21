import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Narrow dependency-free validation for this known frontmatter, not a general YAML parser.
const filename = process.argv[2];
assert.ok(filename, 'Provide the canonical skill path');
const content = readFileSync(filename, 'utf8').replaceAll('\r\n', '\n');
const header = /^---\n([\s\S]*?)\n---\n/.exec(content)?.[1];
assert.ok(header, 'Frontmatter is present');
assert.match(header, /^name: expense-tracker-learning-memory$/m);
assert.match(header, /^description: .+$/m);
assert.match(header, /^metadata:\n  version: '1\.0\.0'$/m);
assert.deepEqual([...header.matchAll(/^(\w[\w-]*):/gm)].map(match => match[1]), ['name', 'description', 'metadata']);
assert.match(content, /## Repository integration/);
console.log('PASS: canonical Expense Tracker skill frontmatter and integration entry point checks.');
console.log('This narrow check does not replace the full Python/PyYAML skill-creator validator.');

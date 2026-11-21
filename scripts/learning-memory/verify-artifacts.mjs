import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { LearningMemory } from './memory.mjs';

const memory = new LearningMemory(process.cwd());
for (const filename of process.argv.slice(2)) {
  const content = readFileSync(memory.safe(filename), 'utf8');
  assert.ok(content.trim().length > 0, `${filename} is nonempty`);
  assert.ok(!/[\t ]+\r?$/m.test(content), `${filename} has no trailing whitespace`);
  console.log(`Verified nonempty artifact and clean trailing whitespace: ${filename}`);
}
assert.ok(process.argv.length > 2, 'At least one artifact must be checked');
console.log('This artifact check does not establish application behavior or replace a content review.');

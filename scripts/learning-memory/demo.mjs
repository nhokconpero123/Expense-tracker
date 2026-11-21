import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LearningMemory } from './memory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const memory = new LearningMemory(root);
const task = 'learning-memory-demo';
if (existsSync(memory.safe(`${memory.taskPath(task)}/DEMONSTRATION.md`))) throw new Error('Demonstration already exists; preserving its history without rerunning or resetting it');
const preflight = memory.preflight(task, 'synthetic fixture memory repair');
assert.equal(preflight.stop, false);
const scratch = mkdtempSync(path.join(tmpdir(), 'expense-learning-demo-'));
const fixturePath = path.join(scratch, 'value.json');
const testPath = path.join(scratch, 'probe.test.mjs');
writeFileSync(fixturePath, '{"value":1}\n');
writeFileSync(testPath, "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; test('synthetic fixture equals 2',()=>assert.equal(JSON.parse(readFileSync(new URL('./value.json',import.meta.url),'utf8')).value,2));\n");
const command = [process.execPath, '--test', '--test-reporter=tap', testPath];
const specification = { kind: 'test', mode: 'synthetic-memory-demonstration', expected: 'The unchanged synthetic assertion requires value 2',
  criteria: ['LM-04', 'LM-05', 'LM-06', 'LM-09'], scope: ['Disposable synthetic fixture only'], artifacts: [fixturePath, testPath],
  failure: { signature: 'synthetic fixture equals 2: actual 1 expected 2', module: 'learning-memory-demonstration', mode: 'synthetic-memory-demonstration' },
  rootCause: { status: 'SUSPECTED', reason: 'The deliberately incorrect synthetic fixture may explain the mismatch; inspect assertion output before confirming' },
  nextAction: 'Inspect actual failure and correct the synthetic fixture without changing the assertion' };
const failed = memory.run(task, 'test', specification, command);
assert.equal(failed.outcome, 'FAIL'); assert.equal(failed.exitCode, 1); assert.equal(failed.counts.failed, 1);
writeFileSync(fixturePath, '{"value":2}\n');
const recovered = new LearningMemory(root).run(task, 'test', { ...specification, repair: true,
  rootCause: { status: 'VERIFIED', reason: 'The fixture contained 1 while the unchanged assertion requires 2; setting only that synthetic value to 2 makes the same test pass' },
  nextAction: 'Promote only the scoped synthetic lesson and preserve the original failure' }, command);
assert.equal(recovered.outcome, 'PASS'); assert.equal(recovered.exitCode, 0); assert.equal(recovered.counts.passed, 1);
const lesson = memory.promote({ claim: 'Correct a proven synthetic fixture mismatch while preserving its original assertion and failure evidence',
  scope: 'Synthetic learning-memory demonstration only; no application behavior', signature: specification.failure.signature,
  action: 'Inspect the exact assertion, correct only the isolated fixture, then rerun the unchanged check', guard: JSON.stringify(command),
  limits: 'Does not prove Expense Tracker functionality, real browser capture, deployment safety, or model switching; fixture command uses a temporary directory',
  tags: ['synthetic', 'fixture', 'memory', 'repair'], events: [failed.id, recovered.id] });
const duplicate = memory.promote({ ...lesson, claim: lesson.claim.toUpperCase() });
assert.equal(duplicate.id, lesson.id); assert.equal(duplicate.duplicate, true);
const retrieval = new LearningMemory(root).preflight(task, 'synthetic fixture');
assert.ok(retrieval.applicableLessons.some(item => item.id === lesson.id));
const summary = { failedEvent: failed.id, recoveredEvent: recovered.id, lesson: lesson.id,
  actualResults: { initial: failed.counts, recovery: recovered.counts }, repairAttempts: recovered.attempt,
  duplicatePrevented: duplicate.duplicate, retrieved: true, scratch, browserScreenshots: 'Not applicable; not captured', modelSwitching: 'ESCALATION_UNAVAILABLE' };
memory.writeNew(`${memory.taskPath(task)}/DEMONSTRATION.md`, '# Synthetic Failure and Recovery Demonstration\n\nThis is a deliberately failing isolated fixture, not an application defect. Both subprocess results are real. The original failure remains immutable.\n\n```json\n' + JSON.stringify(summary, null, 2) + '\n```\n');
console.log(JSON.stringify(summary, null, 2));

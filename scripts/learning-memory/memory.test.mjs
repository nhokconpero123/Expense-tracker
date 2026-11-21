import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, mkdirSync, readdirSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { LearningMemory, failureKey, testCounts } from './memory.mjs';

// Every test owns a disposable root and never opens an application database.
function setup() {
  const root = mkdtempSync(path.join(tmpdir(), 'expense-learning-test-'));
  const memory = new LearningMemory(root);
  const failure = { signature: 'expected synthetic value 2', module: 'synthetic-fixture', mode: 'isolated-test' };
  writeFileSync(path.join(root, 'value.json'), '{"value":1}\n');
  writeFileSync(path.join(root, 'probe.test.mjs'), "import {test} from 'node:test'; import assert from 'node:assert/strict'; import {readFileSync} from 'node:fs'; test('synthetic value',()=>assert.equal(JSON.parse(readFileSync('value.json','utf8')).value,2));\n");
  const command = [process.execPath, '--test', '--test-reporter=tap', 'probe.test.mjs'];
  const spec = { kind: 'test', expected: 'One synthetic assertion passes', failure, mode: 'isolated-test', criteria: ['fixture-only'] };
  const fail = () => memory.run('test-task', 'test', spec, command);
  const repair = (succeed = false) => {
    if (succeed) writeFileSync(path.join(root, 'value.json'), '{"value":2}\n');
    return new LearningMemory(root).run('test-task', 'test', { ...spec, repair: true,
      rootCause: { status: 'VERIFIED', reason: 'Synthetic fixture has value 1 while the unchanged assertion requires 2' },
      artifacts: ['value.json', 'probe.test.mjs'] }, command);
  };
  const promote = (events, extra = {}) => memory.promote({ claim: 'Use the intended synthetic fixture value', scope: 'memory workflow synthetic test only',
    signature: failure.signature, action: 'Set synthetic fixture to 2 without weakening the assertion', guard: 'node --test --test-reporter=tap probe.test.mjs',
    limits: 'Does not establish any application behavior, browser screenshot, or model switching', tags: ['synthetic', 'fixture'], events, ...extra });
  return { root, memory, failure, command, spec, fail, repair, promote };
}

test('initializes projections and preserves user-authored sections', () => {
  const { root, memory } = setup();
  writeFileSync(memory.safe(`${memory.lessons}/verified.md`), '# User notes\n\nKeep this text.\n');
  memory.preflight('test-task', 'synthetic');
  assert.match(memory.read(`${memory.lessons}/verified.md`), /Keep this text/);
  for (const file of ['INDEX.md', 'verified.md', 'patterns.md', 'open-questions.md']) assert.ok(readFileSync(path.join(root, memory.lessons, file)).length);
});

test('captures actual failed command, TAP counts, output, evidence and unknown cause', () => {
  const { memory, fail } = setup();
  const event = fail();
  assert.equal(event.outcome, 'FAIL'); assert.equal(event.exitCode, 1);
  assert.deepEqual([event.counts.total, event.counts.passed, event.counts.failed], [1, 0, 1]);
  assert.equal(event.rootCause.status, 'UNKNOWN');
  assert.match(memory.read(event.evidence[0].path), /ERR_ASSERTION/);
  memory.checkEvidence(event);
});

test('resolution keeps the immutable failed event and accumulated repair attempt', () => {
  const { memory, fail, repair } = setup();
  const failed = fail(); const before = memory.read(`${memory.taskPath('test-task')}/events/${failed.id}.json`);
  const passed = repair(true);
  assert.equal(passed.outcome, 'PASS'); assert.equal(passed.attempt, 1);
  assert.match(passed.reasoning, /High requested; ESCALATION_UNAVAILABLE/);
  assert.equal(memory.read(`${memory.taskPath('test-task')}/events/${failed.id}.json`), before);
  const state = Object.values(memory.failures())[0];
  assert.equal(state.status, 'resolved'); assert.equal(state.attempts, 1);
});

test('three failed repairs persist across instances and a fresh process; fourth is blocked across task IDs', () => {
  const { root, memory, fail, repair, spec, command } = setup();
  fail();
  for (let attempt = 1; attempt <= 3; attempt++) assert.equal(repair().attempt, attempt);
  const inspect = `import {LearningMemory} from ${JSON.stringify(new URL('./memory.mjs', import.meta.url).href)}; console.log(JSON.stringify(new LearningMemory(process.argv[1]).failures()));`;
  const child = spawnSync(process.execPath, ['--input-type=module', '-e', inspect, root], { encoding: 'utf8', windowsHide: true });
  assert.equal(child.status, 0); assert.equal(Object.values(JSON.parse(child.stdout))[0].attempts, 3);
  assert.throws(() => new LearningMemory(root).run('renamed-task', 'test', { ...spec, repair: true }, command), /STOP/);
  assert.equal(memory.events().filter(event => event.type === 'repair-reserved').length, 3);
});

test('an interrupted reservation remains counted after reopening', () => {
  const { root, memory, failure, fail } = setup(); fail();
  memory.locked(() => memory.append('test-task', { type: 'repair-reserved', stage: 'test', outcome: 'BLOCKED', exitCode: null,
    failure, evidence: [], attempt: 1, observed: 'Synthetic interruption before validation' }));
  assert.equal(Object.values(new LearningMemory(root).failures())[0].attempts, 1);
});

test('normalizes failure identity without discarding environment boundaries', () => {
  const { failure } = setup();
  assert.equal(failureKey(failure), failureKey({ ...failure, signature: '  EXPECTED synthetic   value 2  ' }));
  assert.notEqual(failureKey(failure), failureKey({ ...failure, mode: 'different-mode' }));
});

test('rejects missing executable as BLOCKED without invented exit status', () => {
  const { memory } = setup();
  const event = memory.run('test-task', 'test', { kind: 'test', expected: 'Tool runs' }, ['definitely-absent-expense-memory-command']);
  assert.equal(event.outcome, 'BLOCKED'); assert.equal(event.exitCode, null); assert.equal(event.counts, null);
});

test('zero-test exit zero cannot satisfy a required test execution', () => {
  const { root, memory } = setup();
  const emptyRoot = path.join(root, 'empty-workspace'); mkdirSync(emptyRoot);
  const emptyMemory = new LearningMemory(emptyRoot);
  const event = emptyMemory.run('test-task', 'test', { kind: 'test', expected: 'At least one test runs' }, [process.execPath, '--test', '--test-reporter=tap']);
  assert.equal(event.counts.total, 0); assert.equal(event.exitCode, 0); assert.equal(event.outcome, 'FAIL');
  const empty = memory.run('test-task', 'test', { kind: 'test', expected: 'Actual assertions execute' }, [process.execPath, '-e', 'console.log("No tests executed")']);
  assert.equal(empty.exitCode, 0); assert.equal(empty.outcome, 'FAIL'); assert.equal(empty.counts, null);
});

test('nonzero exit remains FAIL even when positive passing counts are reported', () => {
  const { root, memory, spec } = setup();
  writeFileSync(path.join(root, 'passing-with-bad-exit.test.mjs'), "import {test} from 'node:test'; test('passing assertion',()=>{}); process.on('exit',()=>{process.exitCode=1});\n");
  const event = memory.run('another-task', 'test', { ...spec, failure: undefined }, [process.execPath, '--test', '--test-reporter=tap', 'passing-with-bad-exit.test.mjs']);
  assert.ok(event.counts.passed > 0);
  assert.equal(event.outcome, 'FAIL'); assert.notEqual(event.exitCode, 0);
});

test('lesson requires later verified passing evidence and deduplicates normalized claims', () => {
  const { memory, fail, repair, promote } = setup(); const failed = fail();
  assert.throws(() => promote([failed.id]), /finding and later/);
  const passed = repair(true);
  assert.throws(() => promote([passed.id, failed.id]), /later passing/);
  const lesson = promote([failed.id, passed.id]);
  const duplicate = promote([failed.id, passed.id], { claim: '  USE the intended   synthetic fixture value ' });
  assert.equal(duplicate.id, lesson.id); assert.equal(duplicate.duplicate, true); assert.equal(memory.lessonRecords().length, 1);
});

test('suspected cause is retained as unverified and cannot promote a lesson', () => {
  const { memory, fail, root, spec, command, promote } = setup(); const failed = fail();
  writeFileSync(path.join(root, 'value.json'), '{"value":2}\n');
  const passed = memory.run('test-task', 'test', { ...spec, repair: true, rootCause: { status: 'SUSPECTED', reason: 'Fixture mismatch hypothesis' } }, command);
  assert.throws(() => promote([failed.id, passed.id]), /verified cause/);
  assert.match(memory.read(`${memory.lessons}/open-questions.md`), /UNVERIFIED hypothesis/);
  assert.equal(memory.preflight('test-task', 'fixture').unverifiedHypotheses.length, 1);
});

test('detects changed evidence during promotion and retrieval', () => {
  const { memory, fail, repair, promote } = setup(); const failed = fail(); const passed = repair(true);
  promote([failed.id, passed.id]);
  writeFileSync(memory.safe(failed.evidence[0].path), 'tampered\n');
  assert.throws(() => promote([failed.id, passed.id]), /changed evidence/);
  assert.throws(() => memory.preflight('test-task', 'fixture'), /changed evidence/);
});

test('bounds retrieved context and reports omissions without importing terminal logs', () => {
  const { memory, fail, repair, promote } = setup(); const failed = fail(), passed = repair(true);
  for (let i = 0; i < 9; i++) promote([failed.id, passed.id], { claim: `Synthetic fixture rule ${i}: ${'bounded '.repeat(30)}` });
  const context = memory.preflight('test-task', 'fixture', 1000);
  assert.ok(JSON.stringify(context).length <= 1000); assert.ok(context.omittedLessons > 0);
  assert.ok(context.applicableLessons.length <= 5); assert.doesNotMatch(JSON.stringify(context), /STDOUT|ERR_ASSERTION/);
});

test('supersedes a lesson without erasing its record or retrieving obsolete advice', () => {
  const { memory, fail, repair, promote } = setup(); const failed = fail(), passed = repair(true);
  const first = promote([failed.id, passed.id]);
  promote([failed.id, passed.id], { claim: 'Updated synthetic fixture rule', supersedes: first.id });
  assert.equal(memory.lessonRecords().length, 2);
  const result = memory.preflight('test-task', 'fixture');
  assert.equal(result.applicableLessons.length, 1); assert.notEqual(result.applicableLessons[0].id, first.id);
  assert.match(memory.read(`${memory.lessons}/verified.md`), /SUPERSEDED/);
});

test('rejects traversal, symlinked managed paths, and disallowed evidence', t => {
  const { root, memory } = setup();
  assert.throws(() => memory.safe('../outside'), /inside memory root/);
  assert.throws(() => memory.preflight('../outside', 'fixture'), /Invalid task ID/);
  writeFileSync(path.join(root, 'secret.sqlite'), 'not a real database');
  assert.throws(() => memory.run('test-task', 'test', { kind: 'check', expected: 'Check', artifacts: ['secret.sqlite'] }, [process.execPath, '--version']), /Disallowed/);
  const link = path.join(root, 'linked');
  try { symlinkSync(tmpdir(), link, 'junction'); } catch (error) { t.diagnostic(`Symlink creation unavailable: ${error.code}`); return; }
  assert.throws(() => memory.safe('linked/unsafe'), /Symlink/);
});

test('requires screenshot provenance and rejects non-PNG bytes without claiming browser execution', () => {
  const { root, memory } = setup(); writeFileSync(path.join(root, 'synthetic.png'), 'not a screenshot');
  const spec = { kind: 'check', expected: 'Validate import only', artifacts: ['synthetic.png'] };
  assert.throws(() => memory.run('test-task', 'test', spec, [process.execPath, '--version']), /provenance/);
  assert.throws(() => memory.run('test-task', 'test', { ...spec, browser: { version: 'unit-fixture', url: 'http://127.0.0.1', viewport: '360x800', scenario: 'invalid import test only' } }, [process.execPath, '--version']), /Invalid PNG/);
});

test('corrupt journals and competing locks fail closed without resetting history', () => {
  const { root, memory, fail } = setup(); const event = fail();
  writeFileSync(memory.safe('docs/automation/learning-memory.lock'), 'synthetic competing writer');
  assert.throws(() => new LearningMemory(root).preflight('test-task', 'fixture'), /EEXIST/);
  const file = `${memory.taskPath('test-task')}/events/${event.id}.json`;
  const envelope = JSON.parse(memory.read(file)); envelope.record.outcome = 'PASS';
  writeFileSync(memory.safe(file), JSON.stringify(envelope));
  assert.throws(() => memory.events(), /Corrupt event/);
});

test('validates machine counts rather than trusting contradictory totals', () => {
  assert.throws(() => testCounts('', { numTotalTests: 5, numPassedTests: 4, numFailedTests: 0 }), /Invalid machine/);
  assert.deepEqual(testCounts('', { numTotalTests: 2, numPassedTests: 1, numFailedTests: 1, testResults: [{ name: 'actual-report-fixture' }] }).files, ['actual-report-fixture']);
});

test('records non-execution notes without inventing successful checks or exit codes', () => {
  const { memory } = setup();
  const event = memory.note('test-task', 'test', { outcome: 'SKIPPED', observed: 'Browser checks do not apply to this tooling-only fixture' });
  assert.equal(event.outcome, 'SKIPPED'); assert.equal(event.exitCode, null); assert.equal(event.command, null);
  assert.throws(() => memory.note('test-task', 'review', { outcome: 'PASS', observed: 'Unexecuted review' }), /non-execution/);
});

test('retrieves unclassified command failures and blocked prerequisites rather than silently losing them', () => {
  const { memory } = setup();
  memory.run('test-task', 'review', { kind: 'check', expected: 'Diagnostic succeeds' }, [process.execPath, '-e', 'process.exit(1)']);
  memory.note('test-task', 'test', { outcome: 'BLOCKED', observed: 'Optional prerequisite unavailable' });
  const context = memory.preflight('resumed-task', 'diagnostic prerequisite');
  assert.equal(context.unresolvedIssues.length, 2);
});

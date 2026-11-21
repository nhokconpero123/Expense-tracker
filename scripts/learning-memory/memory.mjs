import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, realpathSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const digest = value => createHash('sha256').update(value).digest('hex');
const normalize = value => value.trim().toLowerCase().replace(/\s+/g, ' ');
const stages = ['planning', 'requirements', 'design', 'build', 'test', 'review', 'report'];
const markerStart = '<!-- learning-memory:begin -->';
const markerEnd = '<!-- learning-memory:end -->';
const text = (value, label) => {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000) throw new Error(`Invalid ${label}`);
  return value;
};
const identifier = value => {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(value)) throw new Error('Invalid task ID');
  return value;
};

export function failureKey(failure) {
  return digest(['signature', 'module', 'mode'].map(key => normalize(text(failure[key], key))).join('\n')).slice(0, 20);
}

export function testCounts(output, report) {
  if (report) {
    const counts = { total: report.numTotalTests, passed: report.numPassedTests, failed: report.numFailedTests,
      skipped: (report.numPendingTests ?? 0) + (report.numTodoTests ?? 0), files: report.testResults?.map(file => file.name) ?? [] };
    if (![counts.total, counts.passed, counts.failed, counts.skipped].every(value => Number.isSafeInteger(value) && value >= 0)
      || counts.total !== counts.passed + counts.failed + counts.skipped) throw new Error('Invalid machine test counts');
    return counts;
  }
  const result = {};
  for (const [key, label] of [['total', 'tests'], ['passed', 'pass'], ['failed', 'fail'], ['skipped', 'skipped']]) {
    const match = [...output.matchAll(new RegExp(`^# ${label} (\\d+)\\r?$`, 'gm'))].at(-1);
    if (match) result[key] = Number(match[1]);
  }
  if (['total', 'passed', 'failed', 'skipped'].every(key => key in result)) {
    result.skipped += Number([...output.matchAll(/^# todo (\d+)\r?$/gm)].at(-1)?.[1] ?? 0);
    if (result.total !== result.passed + result.failed + result.skipped) throw new Error('Inconsistent TAP totals');
    return { ...result, files: [], source: 'TAP summary' };
  }
  const browser = [...output.matchAll(/(\d+) passed, (\d+) failed/g)].at(-1);
  return browser ? { total: Number(browser[1]) + Number(browser[2]), passed: Number(browser[1]), failed: Number(browser[2]), skipped: 0, files: [], source: 'browser summary' } : null;
}

export class LearningMemory {
  constructor(root) {
    this.root = realpathSync(root);
    this.tasks = 'docs/automation/tasks';
    this.lessons = 'skills/expense-tracker-learning/lessons';
    this.directory(this.tasks);
    this.directory(`${this.lessons}/records`);
  }

  safe(relative) {
    if (typeof relative !== 'string' || path.isAbsolute(relative) || relative.split(/[\\/]/).includes('..')) throw new Error('Path must stay inside memory root');
    const target = path.resolve(this.root, relative);
    if (target !== this.root && !target.startsWith(this.root + path.sep)) throw new Error('Path escapes memory root');
    let current = this.root;
    for (const part of path.relative(this.root, target).split(path.sep).filter(Boolean)) {
      current = path.join(current, part);
      if (existsSync(current) && lstatSync(current).isSymbolicLink()) throw new Error('Symlink in managed path');
    }
    return target;
  }

  directory(relative) { mkdirSync(this.safe(relative), { recursive: true }); }
  read(relative) { return readFileSync(this.safe(relative), 'utf8'); }
  writeNew(relative, value) { writeFileSync(this.safe(relative), value, { flag: 'wx' }); }
  atomic(relative, value) {
    const temporary = `${relative}.${randomUUID()}.pending`;
    this.writeNew(temporary, value);
    renameSync(this.safe(temporary), this.safe(relative));
  }
  locked(operation) {
    const lock = 'docs/automation/learning-memory.lock';
    this.writeNew(lock, JSON.stringify({ pid: process.pid, timestamp: new Date().toISOString() }));
    try { return operation(); } finally { unlinkSync(this.safe(lock)); }
  }
  taskPath(task) { return `${this.tasks}/${identifier(task)}`; }

  events() {
    const events = [];
    for (const task of readdirSync(this.safe(this.tasks))) {
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(task)) continue;
      const folder = `${this.tasks}/${task}/events`;
      if (!existsSync(this.safe(folder))) continue;
      for (const filename of readdirSync(this.safe(folder)).filter(name => name.endsWith('.json'))) {
        const envelope = JSON.parse(this.read(`${folder}/${filename}`));
        if (digest(JSON.stringify(envelope.record)) !== envelope.sha256 || envelope.record.schema !== 1) throw new Error(`Corrupt event: ${filename}`);
        events.push(envelope.record);
      }
    }
    events.sort((a, b) => a.sequence - b.sequence);
    if (new Set(events.map(event => event.sequence)).size !== events.length) throw new Error('Duplicate event sequence');
    return events;
  }

  failures(events = this.events()) {
    const failures = {};
    for (const event of events) {
      const identity = event.failure ?? (event.type === 'command' ? {
        signature: 'verification command without an explicit failure signature', module: JSON.stringify(event.command), mode: event.environment?.mode ?? 'tooling',
      } : null);
      if (!identity) continue;
      const key = failureKey(identity);
      if (!event.failure && event.outcome === 'PASS' && !failures[key]) continue;
      const failure = failures[key] ??= { id: `F-${key}`, ...identity, attempts: 0, status: 'unresolved', events: [] };
      failure.events.push(event.id);
      if (event.type === 'repair-reserved') failure.attempts++;
      if (event.type === 'command') failure.status = event.outcome === 'PASS' ? 'resolved' : 'unresolved';
      failure.stop = failure.status !== 'resolved' && failure.attempts >= 3;
    }
    return failures;
  }

  checkEvidence(event) {
    for (const item of event.evidence) {
      if (digest(readFileSync(this.safe(item.path))) !== item.sha256) throw new Error(`Missing or changed evidence: ${item.path}`);
    }
  }

  append(task, values) {
    const folder = this.taskPath(task);
    this.directory(`${folder}/events`);
    const git = args => {
      const result = spawnSync('git', args, { cwd: this.root, encoding: 'utf8', windowsHide: true });
      return result.status === 0 ? result.stdout.trim() : 'unavailable';
    };
    const record = { schema: 1, sequence: this.events().length + 1, id: values.id ?? randomUUID(),
      task, timestamp: new Date().toISOString(), branch: git(['branch', '--show-current']), commit: git(['rev-parse', 'HEAD']),
      ...values };
    const eventPath = `${folder}/events/${record.id}`;
    this.writeNew(`${eventPath}.json`, JSON.stringify({ record, sha256: digest(JSON.stringify(record)) }, null, 2) + '\n');
    const markdown = `# Event ${record.id}\n\n`
      + `- Task / stage: ${task} / ${record.stage}\n- Timestamp UTC: ${record.timestamp}\n`
      + `- Git branch / commit: ${record.branch} / ${record.commit} (working tree may be uncommitted)\n`
      + `- Outcome: ${record.outcome}\n- Exit code: ${record.exitCode ?? 'N/A'}\n`
      + `- Root cause: ${record.rootCause?.status ?? 'UNKNOWN'} — ${record.rootCause?.reason ?? 'No causal conclusion'}\n`
      + `- Repair attempt: ${record.attempt ?? 0}\n- Requested/effective reasoning: ${record.reasoning ?? 'Medium requested; effective unknown'}\n`
      + `- Evidence: ${record.evidence.map(item => item.path).join(', ') || 'None; not an execution claim'}\n\n`
      + 'Complete factual record (including command, expected/observed results, scope, criteria, uncertainty and next action):\n\n```json\n'
      + JSON.stringify(record, null, 2) + '\n```\n';
    this.writeNew(`${eventPath}.md`, markdown);
    return record;
  }

  project(task) {
    const events = this.events();
    const own = events.filter(event => event.task === task);
    const failures = this.failures(events);
    const folder = this.taskPath(task);
    this.directory(folder);
    this.atomic(`${folder}/progress.json`, JSON.stringify({ schema: 1, task, lastEvent: own.at(-1)?.id ?? null,
      lastStage: own.at(-1)?.stage ?? null, failures, eventCount: own.length,
      stop: Object.values(failures).some(failure => failure.stop), updatedAt: new Date().toISOString() }, null, 2) + '\n');
    this.managed(`${folder}/FAILURE_REPORT.md`, '# Failure History', Object.values(failures).map(failure =>
      `- ${failure.id}: ${failure.status}; repairs ${failure.attempts}/3; STOP=${failure.stop}; ${failure.signature}; events: ${failure.events.join(', ')}`).join('\n') || 'No failures observed.');
    this.managed(`${folder}/STAGE_SUMMARY.md`, '# Stage Summary', own.slice(-7).map(event =>
      `- ${event.stage}: ${event.outcome}; event ${event.id}; exit ${event.exitCode ?? 'N/A'}; next: ${event.nextAction ?? 'Review evidence'}`).join('\n') || 'No stages executed.');
    this.refreshLessons(events);
    return JSON.parse(this.read(`${folder}/progress.json`));
  }

  managed(relative, heading, body) {
    const section = `${markerStart}\n${body}\n${markerEnd}`;
    const original = existsSync(this.safe(relative)) ? this.read(relative) : `${heading}\n`;
    const start = original.indexOf(markerStart), end = original.indexOf(markerEnd);
    if ((start < 0) !== (end < 0) || (start >= 0 && end < start)) throw new Error(`Broken generated section: ${relative}`);
    const updated = start >= 0 ? original.slice(0, start) + section + original.slice(end + markerEnd.length) : original.trimEnd() + '\n\n' + section + '\n';
    this.atomic(relative, updated);
  }

  lessonRecords() {
    return readdirSync(this.safe(`${this.lessons}/records`)).filter(name => name.endsWith('.json')).map(name => {
      const envelope = JSON.parse(this.read(`${this.lessons}/records/${name}`));
      if (digest(JSON.stringify(envelope.record)) !== envelope.sha256) throw new Error('Corrupt lesson');
      return envelope.record;
    });
  }

  refreshLessons(events = this.events()) {
    const lessons = this.lessonRecords();
    this.managed(`${this.lessons}/INDEX.md`, '# Lesson Index', lessons.map(lesson =>
      `- ${lesson.id}: ${lesson.claim}; scope: ${lesson.scope}; tags: ${lesson.tags.join(', ')}; [verified](verified.md#${lesson.id.toLowerCase()})`).join('\n') || 'No verified lessons yet.');
    this.managed(`${this.lessons}/verified.md`, '# Verified Lessons', lessons.map(lesson =>
      `## ${lesson.id}\n\n- Status: ${lessons.some(item => item.supersedes === lesson.id) ? 'SUPERSEDED (see successor record)' : 'VERIFIED'}\n- Claim: ${lesson.claim}\n- Applies to: ${lesson.scope}\n- Signature: ${lesson.signature}\n- Date/revision: ${lesson.timestamp} / ${lesson.commit}\n- Cause: ${lesson.cause}\n- Corrective action: ${lesson.action}\n- Regression guard: ${lesson.guard}\n- Source events: ${lesson.events.join(', ')}\n- What this does NOT prove: ${lesson.limits}\n`).join('\n') || 'No verified lessons yet.');
    this.managed(`${this.lessons}/patterns.md`, '# Reusable Patterns', lessons.map(lesson =>
      `## PATTERN-${lesson.id}\n\n- Applies to: ${lesson.scope}\n- Trigger/signature: ${lesson.signature}\n- First checks: retrieve source events and reproduce the recorded guard\n- Root cause (verified): ${lesson.cause}\n- Correct design/fix: ${lesson.action}\n- Guard tests: ${lesson.guard}\n- Trade-offs and edge cases: ${lesson.limits}\n- Source events: ${lesson.events.join(', ')}\n- Last reviewed: ${lesson.timestamp} / ${lesson.commit}\n`).join('\n') || 'No evidence-backed reusable patterns yet.');
    const open = Object.values(this.failures(events)).filter(failure => failure.status !== 'resolved');
    const hypotheses = events.filter(event => event.rootCause?.status === 'SUSPECTED');
    this.managed(`${this.lessons}/open-questions.md`, '# Open Questions', [
      ...open.map(failure => `- UNVERIFIED ${failure.id}: ${failure.signature}; attempts ${failure.attempts}/3; STOP=${failure.stop}`),
      ...hypotheses.map(event => `- UNVERIFIED hypothesis from ${event.id}: ${event.rootCause.reason} (historical; consult later events for resolution)`),
    ].join('\n') || 'No unresolved failures or recorded hypotheses.');
  }

  preflight(task, query, maxChars = 6000) {
    return this.locked(() => {
      if (!Number.isInteger(maxChars) || maxChars < 800 || maxChars > 12000) throw new Error('Invalid context budget');
      const progress = this.project(task);
      const terms = normalize(query).split(/\W+/).filter(Boolean);
      const score = value => terms.filter(term => normalize(JSON.stringify(value)).includes(term)).length;
      const records = this.lessonRecords();
      const allLessons = records.filter(lesson => !records.some(item => item.supersedes === lesson.id));
      for (const lesson of allLessons) {
        for (const id of lesson.events) {
          const event = this.events().find(item => item.id === id);
          if (!event) throw new Error('Missing lesson source event');
          this.checkEvidence(event);
        }
      }
      const matching = allLessons.filter(lesson => score(lesson) > 0).sort((a, b) => score(b) - score(a));
      const journal = this.events();
      const unresolved = Object.values(progress.failures).filter(failure => failure.status !== 'resolved');
      for (const event of journal.filter(item => item.type === 'observation' && item.outcome === 'BLOCKED')) {
        unresolved.push({ id: `ISSUE-${event.id}`, signature: event.observed, attempts: 0, stop: false });
      }
      const hypotheses = journal.filter(event => event.rootCause?.status === 'SUSPECTED'
        && !journal.some(later => later.sequence > event.sequence && later.rootCause?.status === 'VERIFIED'
          && event.failure && later.failure && failureKey(event.failure) === failureKey(later.failure)));
      const result = { task, query: query.slice(0, 200), stop: progress.stop,
        applicableLessons: [], unresolvedIssues: [], unverifiedHypotheses: [], omittedHypotheses: hypotheses.length,
        omittedLessons: matching.length, omittedIssues: unresolved.length,
        nonApplicableLessons: allLessons.length - matching.length,
        openRisks: 'Check scope, mode, revision and evidence before applying a lesson. No match is not proof of no risk.',
        proposedTestCoverage: 'Read task REQUIREMENTS.md and choose guards for affected contracts.' };
      for (const failure of unresolved.sort((a, b) => Number(b.stop) - Number(a.stop) || score(b) - score(a))) {
        if (result.unresolvedIssues.length >= 10) break;
        const item = { id: failure.id, signature: failure.signature.slice(0, 250), attempts: failure.attempts, stop: failure.stop };
        if (JSON.stringify({ ...result, unresolvedIssues: [...result.unresolvedIssues, item] }).length > maxChars) break;
        result.unresolvedIssues.push(item); result.omittedIssues--;
      }
      for (const event of hypotheses.sort((a, b) => score(b) - score(a)).slice(0, 5)) {
        const item = { event: event.id, hypothesis: event.rootCause.reason.slice(0, 250), status: 'UNVERIFIED' };
        if (JSON.stringify({ ...result, unverifiedHypotheses: [...result.unverifiedHypotheses, item] }).length > maxChars) break;
        result.unverifiedHypotheses.push(item); result.omittedHypotheses--;
      }
      for (const lesson of matching.slice(0, 5)) {
        const item = { id: lesson.id, claim: lesson.claim, scope: lesson.scope, guard: lesson.guard, events: lesson.events, limits: lesson.limits };
        if (JSON.stringify({ ...result, applicableLessons: [...result.applicableLessons, item] }).length > maxChars) break;
        result.applicableLessons.push(item); result.omittedLessons--;
      }
      this.atomic(`${this.taskPath(task)}/PREFLIGHT.md`, '# Preflight\n\n```json\n' + JSON.stringify(result, null, 2) + '\n```\n');
      return result;
    });
  }

  note(task, stage, observation) {
    return this.locked(() => {
      if (!stages.includes(stage) || !['SKIPPED', 'BLOCKED'].includes(observation.outcome)) throw new Error('A non-execution note must be SKIPPED or BLOCKED');
      text(observation.observed, 'observation');
      const record = this.append(task, { stage, type: 'observation', outcome: observation.outcome, exitCode: null,
        command: null, evidence: [], counts: null, expected: observation.expected ?? 'No execution claimed',
        observed: observation.observed, criteria: observation.criteria ?? [], scope: observation.scope ?? [],
        rootCause: { status: 'UNKNOWN', reason: 'Non-execution note; no causal proof claimed' },
        nextAction: observation.nextAction ?? 'Review missing execution or non-applicability' });
      this.project(task);
      return record;
    });
  }

  run(task, stage, specification, command) {
    return this.locked(() => {
      if (!stages.includes(stage)) throw new Error('Invalid stage');
      if (!Array.isArray(command) || !command.length || !command.every(part => typeof part === 'string')) throw new Error('Invalid command');
      text(specification.expected, 'expected behavior');
      if (!['test', 'check', 'browser'].includes(specification.kind)) throw new Error('Invalid execution kind');
      const rootCause = specification.rootCause ?? { status: 'UNKNOWN', reason: 'No confirmed cause' };
      if (!['VERIFIED', 'SUSPECTED', 'UNKNOWN'].includes(rootCause.status)) throw new Error('Invalid root cause status');
      if (rootCause.status === 'VERIFIED' && (!rootCause.reason || !specification.artifacts?.length)) throw new Error('Verified cause requires explicit supporting evidence');
      const fallbackFailure = { signature: 'verification command without an explicit failure signature', module: JSON.stringify(command), mode: specification.mode ?? 'tooling' };
      const failure = specification.failure ?? fallbackFailure;
      const failures = this.failures();
      if (Object.values(failures).some(item => item.stop)) throw new Error('STOP: unresolved failure has exhausted three repairs');
      const prior = failure ? failures[failureKey(failure)] : null;
      if (specification.repair && (!prior || prior.status === 'resolved')) throw new Error('Repair requires an unresolved recorded failure');
      const id = randomUUID();
      const folder = `${this.taskPath(task)}/evidence/${id}`;
      this.directory(folder);
      const evidence = [];
      const addEvidence = (name, bytes) => {
        const target = `${folder}/${name}`;
        this.directory(path.posix.dirname(target));
        this.writeNew(target, bytes);
        evidence.push({ path: target, sha256: digest(bytes) });
      };
      for (const [index, source] of (specification.artifacts ?? []).entries()) {
        const resolved = path.isAbsolute(source) ? source : this.safe(source);
        if (!lstatSync(resolved).isFile() || lstatSync(resolved).isSymbolicLink() || realpathSync(resolved) !== path.resolve(resolved)) throw new Error('Evidence must be a regular non-symlink file');
        const extension = path.extname(source).toLowerCase();
        if (!['.png', '.json', '.txt', '.log', '.md', '.mjs'].includes(extension) || /(?:^|[\\/])\.env(?:\.|$)/.test(source)) throw new Error('Disallowed evidence file');
        const bytes = readFileSync(resolved);
        if (extension === '.png') {
          if (!specification.browser?.version || !specification.browser?.url || !specification.browser?.viewport || !specification.browser?.scenario) throw new Error('Screenshot requires browser provenance');
          if (bytes.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a') throw new Error('Invalid PNG evidence');
        }
        addEvidence(`${extension === '.png' ? 'screenshots/' : ''}${index}-${path.basename(source)}`, bytes);
      }
      const attempt = specification.repair ? prior.attempts + 1 : prior?.attempts ?? 0;
      const reasoning = specification.repair ? `${attempt === 1 ? 'High' : 'Extra High'} requested; ESCALATION_UNAVAILABLE; effective unknown` : 'Medium requested; effective unknown';
      if (specification.repair) {
        this.append(task, { stage, type: 'repair-reserved', outcome: 'BLOCKED', exitCode: null, failure, attempt, reasoning,
          evidence: [], expected: specification.expected, observed: 'Attempt reserved before execution; pending validation', nextAction: 'Execute repair validation' });
        this.project(task);
      }
      const startedAt = new Date().toISOString();
      // A fresh test subprocess must not inherit Node's private parent-runner context.
      const childEnvironment = { ...process.env };
      delete childEnvironment.NODE_TEST_CONTEXT;
      const execution = spawnSync(command[0], command.slice(1), { cwd: this.root, encoding: 'utf8', shell: false,
        env: childEnvironment, windowsHide: true, timeout: specification.timeoutMs ?? 60000, maxBuffer: 16 * 1024 * 1024 });
      const stdout = execution.stdout ?? '', stderr = execution.stderr ?? '';
      addEvidence('commands.log', `Started UTC: ${startedAt}\nCommand argv: ${JSON.stringify(command)}\nNode: ${process.version}\nExit: ${execution.status ?? 'N/A'}\nSignal: ${execution.signal ?? 'none'}\n\nSTDOUT\n${stdout}\nSTDERR\n${stderr}\nSpawn error: ${execution.error?.message ?? 'none'}\n`);
      let counts = null, ingestionError = null;
      try {
        const report = specification.testReport ? JSON.parse(this.read(specification.testReport)) : null;
        if (report && lstatSync(this.safe(specification.testReport)).mtimeMs < Date.parse(startedAt)) throw new Error('Stale test report');
        counts = testCounts(stdout + '\n' + stderr, report);
        if (report) addEvidence('machine-report.json', JSON.stringify(report, null, 2) + '\n');
      } catch (error) { ingestionError = error.message; }
      if (counts && !counts.files.length) counts.files = command.filter(argument => /\.test\.[cm]?[jt]sx?$/.test(argument));
      const outcome = execution.error ? 'BLOCKED' : execution.status !== 0 || ingestionError || (counts && counts.failed > 0)
        || (specification.kind === 'test' && (!counts || counts.total === 0)) ? 'FAIL' : 'PASS';
      const record = this.append(task, { id, stage, type: 'command', kind: specification.kind, startedAt,
        command, environment: { node: process.version, platform: process.platform, mode: specification.mode ?? 'tooling', npm: specification.npmVersion ?? 'not inspected by recorder' },
        outcome, exitCode: execution.status, signal: execution.signal, counts, ingestionError,
        observed: execution.error?.message ?? ingestionError ?? `Process exited ${execution.status}; see captured output`,
        expected: specification.expected, criteria: specification.criteria ?? [], scope: specification.scope ?? [],
        rootCause, failure: specification.failure || specification.repair || prior || outcome !== 'PASS' ? failure : undefined,
        attempt, reasoning, evidence, browser: specification.browser ?? null,
        uncertainty: specification.uncertainty ?? 'Only the invoked checks are evidenced; no model switching or browser execution is implied.',
        candidateLesson: specification.candidateLesson ?? 'NONE', nextAction: specification.nextAction ?? 'Review result before advancing' });
      this.writeNew(`${folder}/test-results.json`, JSON.stringify({ event: id, outcome, exitCode: record.exitCode, counts, ingestionError }, null, 2) + '\n');
      this.project(task);
      return record;
    });
  }

  promote(lesson) {
    return this.locked(() => {
      for (const key of ['claim', 'scope', 'signature', 'action', 'guard', 'limits']) text(lesson[key], key);
      if (!Array.isArray(lesson.tags) || !lesson.tags.every(tag => typeof tag === 'string')) throw new Error('Invalid lesson tags');
      const events = this.events();
      const sources = (lesson.events ?? []).map(id => events.find(event => event.id === id));
      if (sources.length < 2 || sources.some(event => !event || event.type !== 'command')) throw new Error('Lesson requires finding and later verification events');
      sources.forEach(event => this.checkEvidence(event));
      const verification = sources.at(-1);
      if (verification.sequence <= sources[0].sequence || verification.outcome !== 'PASS' || verification.exitCode !== 0
        || verification.rootCause.status !== 'VERIFIED') throw new Error('Lesson lacks later passing verification with a verified cause');
      const fingerprint = digest([lesson.claim, lesson.scope, lesson.signature].map(normalize).join('\n'));
      const existingRecords = this.lessonRecords();
      if (lesson.supersedes && !existingRecords.some(item => item.id === lesson.supersedes)) throw new Error('Unknown superseded lesson');
      const existing = existingRecords.find(item => item.fingerprint === fingerprint);
      if (existing) return { ...existing, duplicate: true };
      const record = { ...lesson, fingerprint, id: `LESSON-${fingerprint.slice(0, 12)}`, timestamp: new Date().toISOString(),
        commit: verification.commit, cause: verification.rootCause.reason };
      this.writeNew(`${this.lessons}/records/${record.id}.json`, JSON.stringify({ record, sha256: digest(JSON.stringify(record)) }, null, 2) + '\n');
      this.refreshLessons(events);
      return record;
    });
  }
}

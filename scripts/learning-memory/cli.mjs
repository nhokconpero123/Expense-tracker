import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LearningMemory } from './memory.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const [action, task, ...args] = process.argv.slice(2);
try {
  const memory = new LearningMemory(root);
  let result;
  if (action === 'preflight') result = memory.preflight(task, args.join(' '));
  else if (action === 'run') {
    const [stage, specPath, separator, ...command] = args;
    if (separator !== '--') throw new Error('Expected: run TASK STAGE SPEC.json -- EXECUTABLE ARGS');
    result = memory.run(task, stage, JSON.parse(readFileSync(memory.safe(specPath), 'utf8')), command);
    if (result.outcome !== 'PASS') process.exitCode = result.exitCode || 1;
  } else if (action === 'note') result = memory.note(task, args[0], JSON.parse(readFileSync(memory.safe(args[1]), 'utf8')));
  else if (action === 'promote') result = memory.promote(JSON.parse(readFileSync(memory.safe(task), 'utf8')));
  else if (action === 'status') result = memory.locked(() => memory.project(task));
  else throw new Error('Usage: cli.mjs preflight TASK QUERY | run TASK STAGE SPEC.json -- EXECUTABLE ARGS | promote LESSON.json | status TASK');
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.error(`Learning memory BLOCKED: ${error.message}`);
  process.exitCode = 2;
}

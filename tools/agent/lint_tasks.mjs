import { readFileSync, existsSync } from 'node:fs';
import { fail, pass } from '../lib/gate.mjs';

const file = process.argv[2] || 'tasks.json';
if (!existsSync(file)) fail(`missing ${file}`);
const data = JSON.parse(readFileSync(file, 'utf8'));
const ids = new Set();
for (const task of data.tasks || []) {
  if (ids.has(task.id)) fail(`duplicate task id ${task.id}`);
  ids.add(task.id);
  for (const path of task.files || []) {
    if (path.includes('..') || path.startsWith('/')) fail(`${task.id}: invalid path ${path}`);
  }
}
pass(`${ids.size} task cards valid`);

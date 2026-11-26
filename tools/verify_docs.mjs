import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { fail, pass } from './lib/gate.mjs';

const manualPath = '/Users/ntars/Downloads/Amphoreus-Web复刻开发手册.md';
if (!existsSync(manualPath)) fail('手册不可用');
const manual = readFileSync(manualPath, 'utf8');
const tasks = JSON.parse(readFileSync('tasks.json', 'utf8')).tasks;
const section = manual.slice(manual.indexOf('## 16. WBS 任务表'), manual.indexOf('## 17.'));
const manualIds = [...new Set([...section.matchAll(/\|\s*(T\d+\.\d+)\s*\|/g)].map(m => m[1]))];
if (manualIds.length !== 78) fail(`§16 任务数 ${manualIds.length} != 78`);
if (tasks.length !== 78) fail(`tasks.json 任务数 ${tasks.length} != 78`);
const autoCount = tasks.filter(task => task.auto !== false).length;
const manualCount = tasks.filter(task => task.auto === false).length;
if (autoCount !== 71) fail(`tasks.json 可自动任务数 ${autoCount} != 71`);
if (manualCount !== 7) fail(`tasks.json 人工任务数 ${manualCount} != 7`);
if (!/78\s*条任务\s*\/\s*71\s*条可自动\s*\/\s*7\s*条必须人工/.test(manual)) {
  fail('手册 17.3 的 78/71/7 任务统计与门禁不一致');
}
const manualIdSet = new Set(manualIds);
const taskIds = new Set(tasks.map(t => t.id));
if (manualIds.some(id => !taskIds.has(id))) fail('tasks.json 缺少 §16 任务');
if ([...taskIds].some(id => !manualIdSet.has(id))) fail('tasks.json 含手册外任务');
for (const task of tasks) {
  for (const file of task.files || []) {
    if (task.auto === false || /^T1\./.test(task.id)) continue;
    if (!existsSync(file)) fail(`${task.id}: 文件不存在 ${file}`);
  }
}
const appendixCount = Number((manual.match(/附录 C 共\s*(\d+)\s*个 clip/) || [])[1]);
if (appendixCount && appendixCount !== 47) fail(`附录 C 计数 ${appendixCount} != 47`);
// The manual mentions Playwright only in deprecation context; runtime and
// tools must not depend on it. Check our own code instead.
const banned = ['app', 'tools'].flatMap(dir =>
  readdirSync(dir).filter(name => name.endsWith('.mjs') || name.endsWith('.js'))
    .map(name => `${dir}/${name}`));
for (const file of banned) {
  if (/from\s+['"]playwright/.test(readFileSync(file, 'utf8'))) fail(`${file}: playwright import`);
}
pass(`docs verified: ${manualIds.length} tasks, ids/files/counts consistent`);

import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseUnityYaml } from './unityyaml.mjs';
import { fail, pass } from './gate.mjs';

const SOURCE = process.env.TAROT_ANIM_DIR ||
  '/Users/ntars/Downloads/hsr-ui-extract/exports/convert-all/assets/asbres/ui/animation/tarotbook';
let files;
try { files = readdirSync(SOURCE).filter(name => name.endsWith('.anim')).sort(); }
catch (error) { console.error(`ENVFAIL ${error.message}`); process.exit(2); }
if (files.length !== 47) fail(`T1 clip 数 ${files.length} != 47`);
const parsed = new Map();
for (const file of files) {
  let data;
  try { data = parseUnityYaml(readFileSync(join(SOURCE, file), 'utf8')).AnimationClip; }
  catch (error) { fail(`T1 ${file}: ${error.message}`); }
  if (!data?.m_Name) fail(`T2 ${file}: 缺少 m_Name`);
  if (data.m_Name !== file.replace(/\.anim$/, '')) fail(`T2 ${file}: m_Name=${data.m_Name}`);
  parsed.set(file, data);
}
const wiki = parsed.get('TarotBookWikiDialog_Normal_FadeIn.anim');
if (!wiki || (wiki.m_EulerCurves || []).length !== 4) fail('T3 m_EulerCurves.length != 4');
for (const [file, clip] of parsed) {
  const curves = [
    ...(clip.m_EulerCurves || []), ...(clip.m_ScaleCurves || []),
    ...(clip.m_PositionCurves || []), ...(clip.m_FloatCurves || []),
  ];
  for (const entry of curves) {
    if (typeof entry.path !== 'string') fail(`T4 ${file}: curve 缺少 path`);
    const keys = entry.curve?.m_Curve || [];
    for (let i = 1; i < keys.length; i++) {
      if (keys[i].time < keys[i - 1].time) fail(`T4 ${file}: time 不单调`);
    }
  }
}
pass('unityyaml 4/4 assertions pass');

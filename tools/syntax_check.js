const fs = require('fs');
const path = require('path');
const p = path.join(process.cwd(), 'orchestration-builder.html');
const s = fs.readFileSync(p,'utf8');
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m;
let idx = 0;
while ((m = re.exec(s)) !== null) {
  idx++;
  const script = m[1];
  console.log('Checking script #' + idx + ' length ' + script.length);
  const stack = [];
  let inSingle = false, inDouble = false, inTemplate = false, prev = '';
  for (let i = 0; i < script.length; i++) {
    const ch = script[i];
    if (ch === '\\' && (inSingle || inDouble || inTemplate)) { i++; continue; }
    if (!inSingle && !inDouble && ch === '`') { inTemplate = !inTemplate; continue; }
    if (!inTemplate && !inDouble && ch === "'") { inSingle = !inSingle; continue; }
    if (!inTemplate && !inSingle && ch === '"') { inDouble = !inDouble; continue; }
    if (inSingle || inDouble || inTemplate) continue;
    if (ch === '(') stack.push({c:'(', pos:i});
    if (ch === ')') {
      const last = stack[stack.length-1];
      if (!last || last.c !== '(') { console.error('Unmatched ) at pos', i); process.exit(2); }
      stack.pop();
    }
    if (ch === '{') stack.push({c:'{', pos:i});
    if (ch === '}') {
      const last = stack[stack.length-1];
      if (!last || last.c !== '{') { console.error('Unmatched } at pos', i); process.exit(3); }
      stack.pop();
    }
    if (ch === '[') stack.push({c:'[', pos:i});
    if (ch === ']') {
      const last = stack[stack.length-1];
      if (!last || last.c !== '[') { console.error('Unmatched ] at pos', i); process.exit(4); }
      stack.pop();
    }
  }
  if (inTemplate) { console.error('Unclosed template literal in script', idx); process.exit(5); }
  if (inSingle) { console.error('Unclosed single quote in script', idx); process.exit(6); }
  if (inDouble) { console.error('Unclosed double quote in script', idx); process.exit(7); }
  if (stack.length) { console.error('Unmatched tokens remain in script', idx, stack[stack.length-1]); process.exit(8); }
  console.log('Script #' + idx + ' looks balanced.');
}
console.log('All script blocks checked.');

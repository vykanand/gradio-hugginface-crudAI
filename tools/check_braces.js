const fs = require('fs');
const path = process.argv[2] || 'orchestration-builder.html';
const p = path.startsWith('c:') ? path : 'c:/dev/gradio-hugginface-crudAI/' + path;
const s = fs.readFileSync(p, 'utf8');
let stack = [];
for (let i = 0; i < s.length; i++) {
  const ch = s[i];
  if (ch === '{') stack.push(i);
  else if (ch === '}') {
    if (stack.length === 0) {
      console.log('EXTRA_CLOSING', i);
      process.exit(0);
    } else stack.pop();
  }
}
if (stack.length) console.log('UNMATCHED_OPEN', stack[0]);
else console.log('BALANCED');

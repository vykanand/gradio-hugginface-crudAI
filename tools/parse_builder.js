const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, '..', 'orchestration-builder.html');
const txt = fs.readFileSync(file, 'utf8');
const m = txt.match(/<script[^>]*>([\s\S]*)<\/script>/i);
if (!m) { console.log('No <script> block found'); process.exit(0); }
const script = m[1];
function testSlice(n) {
  try {
    new Function(script.slice(0, n));
    return true;
  } catch (e) {
    return false;
  }
}

// quick whole-file test
try {
  new Function(script);
  console.log('OK: script parses as valid JS');
  process.exit(0);
} catch (e) {
  console.error('PARSE_ERROR:', e && e.message);
}

// binary search for failure point
let lo = 0;
let hi = script.length;
while (lo < hi) {
  const mid = Math.floor((lo + hi) / 2);
  if (testSlice(mid)) lo = mid + 1;
  else hi = mid;
}
const pos = lo;
// show surrounding context
const start = Math.max(0, pos - 200);
const end = Math.min(script.length, pos + 200);
console.error('Approx failure index:', pos);
console.error('Context around failure:\n--- START ---\n' + script.slice(start, end) + '\n--- END ---');
process.exit(2);

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const file = process.argv[2];
if (!file) { console.error('Usage: node tools/inspect_backticks.js <file>'); process.exit(2); }
const t = fs.readFileSync(file,'utf8');
const idxs = [];
for (let i=0;i<t.length;i++) if (t[i]==='`') idxs.push(i);
console.log('backtick count:', idxs.length);
const lines = t.split(/\r\n|\n/);
for (const idx of idxs) {
  const line = t.slice(0,idx).split(/\r\n|\n/).length;
  console.log(`idx ${idx} line ${line} snippet: ${JSON.stringify(t.slice(idx-30, idx+30))}`);
}

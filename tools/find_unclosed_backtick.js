#!/usr/bin/env node
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('Usage: node tools/find_unclosed_backtick.js <file>'); process.exit(2); }
const t = fs.readFileSync(file,'utf8');
let state = { inSingle:false, inDouble:false, inBack:false, inLineComment:false, inBlockComment:false, esc:false };
let line=1,col=0; let firstOpen=null;
for (let i=0;i<t.length;i++){
  const ch = t[i];
  if (ch==='\n'){ line++; col=0; state.inLineComment=false; state.esc=false; continue; }
  if (state.inLineComment){ col++; continue; }
  if (state.inBlockComment){ if (ch==='*' && t[i+1]==='/'){ state.inBlockComment=false; i++; col+=2; continue; } col++; continue; }
  if (!state.inSingle && !state.inDouble && !state.inBack){
    if (ch==='/' && t[i+1]==='/'){ state.inLineComment=true; i++; col+=2; continue; }
    if (ch==='/' && t[i+1]==='*'){ state.inBlockComment=true; i++; col+=2; continue; }
  }
  if (!state.inLineComment && !state.inBlockComment){
    if (!state.esc && ch==='"' && !state.inSingle && !state.inBack){ state.inDouble = !state.inDouble; col++; continue; }
    if (!state.esc && ch==="'" && !state.inDouble && !state.inBack){ state.inSingle = !state.inSingle; col++; continue; }
    if (!state.esc && ch==='`' && !state.inSingle && !state.inDouble){
      if (!state.inBack){ state.inBack=true; firstOpen = {idx:i,line,col}; }
      else { state.inBack=false; }
      col++; continue;
    }
    if ((state.inSingle || state.inDouble || state.inBack) && ch==='\\' && !state.esc){ state.esc=true; col++; continue; }
  }
  if (state.esc){ state.esc=false; }
  col++;
}
if (state.inBack) console.log('Unclosed backtick at', firstOpen); else console.log('No unclosed backtick detected.');

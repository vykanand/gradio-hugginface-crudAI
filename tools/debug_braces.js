#!/usr/bin/env node
const fs = require('fs');
const file = process.argv[2];
if (!file) { console.error('Usage: node tools/debug_braces.js <file>'); process.exit(2); }
const t = fs.readFileSync(file,'utf8');
let stack = [];
let line=1,col=0;
let state={inSingle:false,inDouble:false,inBack:false,inLine:false,inBlock:false,esc:false};
for(let i=0;i<t.length;i++){
  const ch=t[i];
  if(ch==='\n'){ line++; col=0; state.inLine=false; state.esc=false; continue; }
  if(state.inLine){ col++; continue; }
  if(state.inBlock){ if(ch==='*' && t[i+1]==='/'){ state.inBlock=false; i++; col+=2; continue; } col++; continue; }
  if(!state.inSingle && !state.inDouble && !state.inBack){ if(ch==='/' && t[i+1]==='/'){ state.inLine=true; i++; col+=2; continue; } if(ch==='/' && t[i+1]==='*'){ state.inBlock=true; i++; col+=2; continue; } }
  if(!state.inLine && !state.inBlock){ if(!state.esc && ch==='"' && !state.inSingle && !state.inBack){ state.inDouble=!state.inDouble; col++; continue; } if(!state.esc && ch==="'" && !state.inDouble && !state.inBack){ state.inSingle=!state.inSingle; col++; continue; } if(!state.esc && ch==='`' && !state.inSingle && !state.inDouble){ state.inBack=!state.inBack; col++; continue; } if((state.inSingle||state.inDouble||state.inBack) && ch==='\\' && !state.esc){ state.esc=true; col++; continue; } }
  if(state.esc){ state.esc=false; }
  if(!state.inSingle && !state.inDouble && !state.inBack){ if(ch==='{'){ stack.push({idx:i,line,col}); } else if(ch==='}') { if(stack.length===0){ console.log('First unmatched closing brace at', {idx:i,line,col}); const lines=t.split(/\r\n|\n/); const L=line; console.log('Context:\n', lines.slice(Math.max(0,L-4), Math.min(lines.length, L+3)).map((ln,ii)=>`${L-4+ii+1}: ${ln}`).join('\n')); process.exit(0); } else stack.pop(); } }
  col++;
}
console.log('No early unmatched closing braces; unclosed openings count:', stack.length);
if(stack.length) console.log('First unclosed opening at', stack[stack.length-1]);

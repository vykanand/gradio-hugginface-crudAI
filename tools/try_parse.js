const fs=require('fs');
const s=fs.readFileSync('orchestration-builder.html','utf8');
const re=/<script[^>]*>([\s\S]*?)<\/script>/i;
const m=re.exec(s);
if(!m){console.error('no script');process.exit(1);}const script=m[1];
try{ new Function(script); console.log('PARSE_OK'); } catch(e){ console.error('PARSE_ERROR', e && e.message); console.error(e.stack); process.exit(1); }
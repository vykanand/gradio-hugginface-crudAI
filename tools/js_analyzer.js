#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

function idxToLineCol(s, idx) {
  let line = 1, col = 1;
  for (let i = 0; i < idx && i < s.length; i++) {
    if (s[i] === '\n') { line++; col = 1; } else col++;
  }
  return { line, col };
}

function snippetAround(s, idx, before = 80, after = 80) {
  const start = Math.max(0, idx - before);
  const end = Math.min(s.length, idx + after);
  const pre = s.slice(start, idx);
  const post = s.slice(idx, end);
  return (start > 0 ? '...' : '') + pre + '>>HERE>>' + post + (end < s.length ? '...' : '');
}

function extractScriptsFromHTML(content) {
  const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
  const scripts = [];
  let m, i = 0;
  while ((m = re.exec(content)) !== null) {
    i++;
    const fullMatch = m[0];
    const script = m[1];
    const startIndex = content.indexOf(fullMatch, re.lastIndex - fullMatch.length);
    const scriptStart = startIndex + fullMatch.indexOf(m[1]);
    scripts.push({ index: i, script, scriptStart, fullMatchStart: startIndex });
  }
  return scripts;
}

function extractStylesFromHTML(content) {
  const re = /<style[^>]*>([\s\S]*?)<\/style>/gi;
  const styles = [];
  let m, i = 0;
  while ((m = re.exec(content)) !== null) {
    i++;
    const fullMatch = m[0];
    const css = m[1];
    const startIndex = content.indexOf(fullMatch, re.lastIndex - fullMatch.length);
    const cssStart = startIndex + fullMatch.indexOf(m[1]);
    styles.push({ index: i, css, cssStart, fullMatchStart: startIndex });
  }
  return styles;
}

function analyzeCSS(css, label) {
  const out = { label, errors: [], summary: {} };
  // quick parse: braces balance and missing semicolons
  const stack = [];
  let inComment = false;
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    const nxt = css[i+1];
    if (!inComment && ch === '/' && nxt === '*') { inComment = true; i++; continue; }
    if (inComment && ch === '*' && nxt === '/') { inComment = false; i++; continue; }
    if (inComment) continue;
    if (ch === '{') stack.push({c:'{',pos:i});
    else if (ch === '}') {
      const last = stack[stack.length-1];
      if (!last || last.c !== '{') { out.errors.push({ type: 'UnmatchedClose', char: '}', pos: i, message: "Unmatched '}' in CSS" }); break; }
      stack.pop();
    }
  }
  if (stack.length) out.errors.push({ type: 'UnmatchedOpen', token: '{', pos: stack[stack.length-1].pos, message: 'Unclosed "{" in CSS' });

  // check missing semicolons for property declarations (multi-line aware)
  const lines = css.split(/\n/);
  let offset = 0;
  for (let li = 0; li < lines.length; li++) {
    const raw = lines[li];
    const line = raw.trim();
    if (!line) { offset += raw.length + 1; continue; }
    if (/^[a-zA-Z\-]+\s*:/i.test(line)) {
      // scan forward until ';' or '}' encountered
      let foundSemi = false;
      let scanOffset = offset + raw.indexOf(line);
      let scanPos = scanOffset + line.length;
      let searchText = css.slice(scanOffset);
      for (let k = 0; k < searchText.length; k++) {
        const ch = searchText[k];
        if (ch === ';') { foundSemi = true; break; }
        if (ch === '}') break; // property closed by block end without semicolon
      }
      if (!foundSemi) {
        const pos = offset + raw.indexOf(line);
        out.errors.push({ type: 'MissingSemicolon', pos, message: 'CSS property missing terminating ";"', line: li+1 });
      }
    }
    offset += raw.length + 1;
  }

  // map positions to line/col and snippet
  out.errors = out.errors.map(err => {
    if (typeof err.pos === 'number') {
      const lc = idxToLineCol(css, err.pos);
      return Object.assign({}, err, { line: lc.line, col: lc.col, snippet: snippetAround(css, err.pos) });
    }
    return err;
  });
  return out;
}

function analyzeScript(script, label) {
  const out = { label, errors: [], warnings: [], summary: {} };

  // 1) Try to parse via new Function to catch SyntaxError info
  try {
    new Function(script);
    out.summary.parsed = true;
  } catch (e) {
    out.summary.parsed = false;
    if (e && e instanceof SyntaxError) {
      out.errors.push({ type: 'SyntaxError', message: e.message });
    } else {
      out.warnings.push({ type: 'ParseException', message: String(e) });
    }
  }

  // 2) Token balance scanner (handles quotes and template expressions ${...})
  const stack = [];
  let inSingle = false, inDouble = false, inTemplate = false;
  let i = 0;
  for (; i < script.length; i++) {
    const ch = script[i];
    // handle escapes inside strings/templates
    if (ch === '\\') { i++; continue; }
    if (!inSingle && !inDouble && ch === '`') {
      inTemplate = !inTemplate;
      continue;
    }
    if (!inTemplate && !inDouble && ch === "'") { inSingle = !inSingle; continue; }
    if (!inTemplate && !inSingle && ch === '"') { inDouble = !inDouble; continue; }

    if (inSingle || inDouble) continue; // ignore braces/parens inside normal strings

    if (inTemplate) {
      // if we see ${ we need to allow nested braces until matching }
      if (ch === '$' && script[i+1] === '{') {
        stack.push({ c: '${', pos: i });
        i++; // skip '{' next loop
        continue;
      }
      // else if '}' could close a ${
      if (ch === '}') {
        const last = stack[stack.length-1];
        if (last && last.c === '${') { stack.pop(); continue; }
        // otherwise treat '}' as normal char inside template (allowed) - do nothing
        continue;
      }
      continue; // don't treat other braces specially while in template
    }

    // Not in strings/templates: track (), {}, []
    if (ch === '(') stack.push({ c: '(', pos: i });
    else if (ch === ')') {
      const last = stack[stack.length-1];
      if (!last || last.c !== '(') {
        const pos = i; out.errors.push({ type: 'UnmatchedClose', char: ')', pos, message: "Unmatched ')'" }); break;
      } else stack.pop();
    } else if (ch === '{') stack.push({ c: '{', pos: i });
    else if (ch === '}') {
      const last = stack[stack.length-1];
      if (!last || last.c !== '{') { const pos = i; out.errors.push({ type: 'UnmatchedClose', char: '}', pos, message: "Unmatched '}'" }); break; } else stack.pop();
    } else if (ch === '[') stack.push({ c: '[', pos: i });
    else if (ch === ']') {
      const last = stack[stack.length-1];
      if (!last || last.c !== '[') { const pos = i; out.errors.push({ type: 'UnmatchedClose', char: ']', pos, message: "Unmatched ']'" }); break; } else stack.pop();
    }
  }

  if (inTemplate) out.errors.push({ type: 'UnclosedTemplate', message: 'Unclosed template literal (`) detected' });
  if (inSingle) out.errors.push({ type: 'UnclosedSingleQuote', message: "Unclosed single-quoted string detected" });
  if (inDouble) out.errors.push({ type: 'UnclosedDoubleQuote', message: 'Unclosed double-quoted string detected' });

  if (stack.length) {
    const err = { type: 'UnmatchedOpen', token: stack[stack.length-1].c, pos: stack[stack.length-1].pos, message: `Unmatched open token ${stack[stack.length-1].c}` };
    // If the engine parse succeeded, downgrade to warning (scanner can be conservative/fragile)
    if (out.summary.parsed) out.warnings.push(err); else out.errors.push(err);
  }

  // map positions to line/col and snippets
  out.errors = out.errors.map(err => {
    if (typeof err.pos === 'number') {
      const lc = idxToLineCol(script, err.pos);
      return Object.assign({}, err, { line: lc.line, col: lc.col, snippet: snippetAround(script, err.pos) });
    }
    return err;
  });

  // If parsed by engine, move any UnmatchedClose findings to warnings to avoid false positives
  if (out.summary.parsed) {
    out.warnings = out.warnings || [];
    const remaining = [];
    for (const e of out.errors) {
      if (e.type && e.type.startsWith('Unmatched')) out.warnings.push(e); else remaining.push(e);
    }
    out.errors = remaining;
  }

  return out;
}

function analyzeHTML(content) {
  const out = { label: 'html', errors: [], details: { scripts: [], styles: [], inlineStyles: [] } };
  // 1) Tag balance (best-effort) - ignore void elements
  // Strip script/style blocks first to avoid false positives from JS/CSS content
  const stripped = content.replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const voidEls = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
  const tagRe = /<\s*\/??\s*([a-zA-Z0-9\-]+)([^>]*)>/g;
  const stack = [];
  let m;
  while ((m = tagRe.exec(stripped)) !== null) {
    const full = m[0];
    const name = (m[1] || '').toLowerCase();
    const isClose = /^<\s*\//.test(full);
    const selfClosing = /\/$/.test(full) || /<\s*[^>]+\/>/.test(full);
    if (isClose) {
      // pop until matching
      if (stack.length === 0) {
        const pos = m.index; out.errors.push({ type: 'UnmatchedCloseTag', tag: name, pos, message: `Unmatched closing tag </${name}>` });
      } else {
        let last = stack[stack.length-1];
        if (last.name === name) stack.pop();
        else {
          // try to find matching earlier
          const idx = stack.map(x=>x.name).lastIndexOf(name);
          if (idx === -1) {
            const pos = m.index; out.errors.push({ type: 'UnmatchedCloseTag', tag: name, pos, message: `Unmatched closing tag </${name}>` });
          } else {
            // pop until idx
            stack.splice(idx);
          }
        }
      }
    } else if (!selfClosing && !voidEls.has(name)) {
      // opening tag
      stack.push({ name, pos: m.index });
    }
  }
  if (stack.length) {
    for (const s of stack) { out.errors.push({ type: 'UnclosedTag', tag: s.name, pos: s.pos, message: `Unclosed tag <${s.name}>` }); }
  }

  // 2) Extract scripts & styles and analyze them
  const scripts = extractScriptsFromHTML(content);
  for (const s of scripts) {
    const a = analyzeScript(s.script, `script#${s.index}`);
    // map script-local pos to file-level
    a.errors = a.errors.map(err => {
      if (err && typeof err.pos === 'number') {
        const filePos = s.scriptStart + err.pos;
        const lc = idxToLineCol(content, filePos);
        return Object.assign({}, err, { fileLine: lc.line, fileCol: lc.col });
      }
      return err;
    });
    out.details.scripts.push(a);
  }

  const styles = extractStylesFromHTML(content);
  for (const st of styles) {
    const a = analyzeCSS(st.css, `style#${st.index}`);
    a.errors = a.errors.map(err => {
      if (err && typeof err.pos === 'number') {
        const filePos = st.cssStart + err.pos;
        const lc = idxToLineCol(content, filePos);
        return Object.assign({}, err, { fileLine: lc.line, fileCol: lc.col });
      }
      return err;
    });
    out.details.styles.push(a);
  }

  // inline style attributes
  const inlineStyleRe = /style\s*=\s*(["'])([\s\S]*?)\1/gi;
  let idx = 0;
  while ((m = inlineStyleRe.exec(content)) !== null) {
    idx++;
    const cssText = m[2];
    const pos = m.index + m[0].indexOf(m[2]);
    const a = analyzeCSS(cssText, `inline-style#${idx}`);
    a.errors = a.errors.map(err => {
      if (err && typeof err.pos === 'number') {
        const filePos = pos + err.pos;
        const lc = idxToLineCol(content, filePos);
        return Object.assign({}, err, { fileLine: lc.line, fileCol: lc.col });
      }
      return err;
    });
    out.details.inlineStyles.push(a);
  }

  return out;
}

function analyzeFile(filePath) {
  const abs = path.resolve(process.cwd(), filePath);
  if (!fs.existsSync(abs)) { console.error('File not found', abs); process.exit(2); }
  const content = fs.readFileSync(abs,'utf8');
  const isHTML = /<script[\s\S]*?>[\s\S]*?<\/script>/i.test(content);
  const results = { file: filePath, isHTML, issues: [] };
  if (isHTML) {
    const scripts = extractScriptsFromHTML(content);
    if (!scripts.length) { console.warn('No <script> blocks found in HTML file'); }
    for (const s of scripts) {
      const a = analyzeScript(s.script, `script#${s.index}`);
      // add file-level mapping for snippet: convert script-local line/col to file-level
      a.errors = a.errors.map(err => {
        if (err && typeof err.pos === 'number') {
          const filePos = s.scriptStart + err.pos;
          const lc = idxToLineCol(content, filePos);
          return Object.assign({}, err, { fileLine: lc.line, fileCol: lc.col });
        }
        return err;
      });
      results.issues.push(a);
    }
  } else {
    const a = analyzeScript(content, 'file');
    a.errors = a.errors.map(err => {
      if (err && typeof err.pos === 'number') {
        const lc = idxToLineCol(content, err.pos);
        return Object.assign({}, err, { fileLine: lc.line, fileCol: lc.col });
      }
      return err;
    });
    results.issues.push(a);
  }
  return results;
}

if (require.main === module) {
  const target = process.argv[2];
  if (!target) {
    console.error('Usage: node tools/js_analyzer.js <path-to-js-or-html>');
    process.exit(1);
  }
  const res = analyzeFile(target);
  // print concise human output then JSON
  if (res.isHTML) {
    console.log('== HTML Analysis ==');
    if (res.issues && res.issues.length) {
      for (const block of res.issues) {
        console.log(`-- Block: ${block.label}`);
        if (block.summary && block.summary.parsed) console.log('  JS parse: OK');
        if (block.errors && block.errors.length) {
          for (const e of block.errors) {
            console.log(`  - ${e.type}: ${e.message}`);
            if (e.fileLine) console.log(`    file-line:${e.fileLine} file-col:${e.fileCol}`);
            if (e.snippet) console.log('    snippet:', e.snippet.replace(/\n/g,'\\n'));
          }
        }
        if (block.warnings && block.warnings.length) {
          for (const w of block.warnings) console.log('  - WARN:', w.type, w.message);
        }
      }
    }
    // print HTML-level issues
    const htmlRes = analyzeHTML(fs.readFileSync(target,'utf8'));
    if (htmlRes.errors && htmlRes.errors.length) {
      console.log('\n== HTML issues ==');
      for (const e of htmlRes.errors) {
        console.log(`- ${e.type}: ${e.message}`);
        if (e.pos) {
          const lc = idxToLineCol(fs.readFileSync(target,'utf8'), e.pos);
          console.log(`  file-line:${lc.line} file-col:${lc.col}`);
        }
      }
    }
    // print style/script details
    if (htmlRes.details) {
      for (const s of htmlRes.details.scripts) {
        if (s.errors && s.errors.length) {
          console.log(`\n== Script ${s.label} issues ==`);
          for (const e of s.errors) {
            console.log(`- ${e.type}: ${e.message}`);
            if (e.fileLine) console.log(`  file-line:${e.fileLine} file-col:${e.fileCol}`);
            if (e.snippet) console.log('  snippet:', e.snippet.replace(/\n/g,'\\n'));
          }
        }
      }
      for (const st of htmlRes.details.styles) {
        if (st.errors && st.errors.length) {
          console.log(`\n== Style ${st.label} issues ==`);
          for (const e of st.errors) {
            console.log(`- ${e.type}: ${e.message}`);
            if (e.fileLine) console.log(`  file-line:${e.fileLine} file-col:${e.fileCol}`);
            if (e.snippet) console.log('  snippet:', e.snippet.replace(/\n/g,'\\n'));
          }
        }
      }
    }
  } else {
    for (const block of res.issues) {
      console.log('== Analysis for', block.label, '==');
      if (block.summary.parsed) console.log('- Parse check: OK'); else console.log('- Parse check: FAILED');
      if (!block.errors.length) console.log('- No errors found by static checks.');
      for (const e of block.errors) {
        console.log(`- ${e.type}: ${e.message || ''}`);
        if (e.line) console.log(`  line:${e.line} col:${e.col}`);
        if (e.snippet) console.log('  snippet:', e.snippet.replace(/\n/g,'\\n'));
      }
      if (block.warnings && block.warnings.length) {
        for (const w of block.warnings) console.log('- WARN:', w.type, w.message);
      }
    }
  }
  console.log('\n=== JSON OUTPUT ===');
  console.log(JSON.stringify(res, null, 2));
}

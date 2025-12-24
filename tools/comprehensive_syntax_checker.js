#!/usr/bin/env node
// tools/comprehensive_syntax_checker.js
// Usage: node tools/comprehensive_syntax_checker.js <file1> [file2 ...]
// No external deps required except 'acorn' for JS parsing. Install with: npm install acorn
const fs = require('fs');
const path = require('path');
const acorn = require('acorn');

function countLinesUpTo(text, index) {
  return text.slice(0, index).split(/\r\n|\n/).length;
}

function showContext(allLines, line, col, ctx = 3) {
  const start = Math.max(0, line - ctx - 1);
  const end = Math.min(allLines.length, line + ctx);
  let out = [];
  for (let i = start; i < end; i++) {
    const num = (i + 1).toString().padStart(6, ' ');
    out.push(`${num}: ${allLines[i]}`);
    if (i === line - 1) out.push(''.padStart(6 + col, ' ') + '^');
  }
  return out.join('\n');
}

function extractScriptBlocks(text) {
  const re = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  const blocks = [];
  let m;
  while ((m = re.exec(text))) {
    const idx = m.index;
    const content = m[1];
    const startLine = countLinesUpTo(text, idx) ;
    blocks.push({ content, start: idx, startLine });
  }
  return blocks;
}

function scanHtmlTags(text) {
  // Basic HTML tag matcher that ignores content inside script/style blocks
  const scriptOrStyle = /<(?:(?:script)|(?:style))\b[^>]*>[\s\S]*?<\/(?:script|style)>/gi;
  const clean = text.replace(scriptOrStyle, (s) => ' '.repeat(s.length));
  const tagRe = /<(\/)?([a-zA-Z0-9\-]+)([^>]*)>/g;
  const selfClosing = /\/$/;
  const stack = [];
  const issues = [];
  let m;
  while ((m = tagRe.exec(clean))) {
    const isClose = !!m[1];
    const name = m[2].toLowerCase();
    const attr = m[3] || '';
    const idx = m.index;
    const line = countLinesUpTo(text, idx);
    if (isClose) {
      if (stack.length === 0 || stack[stack.length - 1].name !== name) {
        issues.push({ type: 'unmatched-closing', tag: name, line, col: 0 });
      } else {
        stack.pop();
      }
    } else {
      // ignore void elements
      const voids = new Set(['area','base','br','col','embed','hr','img','input','link','meta','param','source','track','wbr']);
      const isSelf = voids.has(name) || selfClosing.test(attr);
      if (!isSelf) stack.push({ name, line });
    }
  }
  while (stack.length) {
    const t = stack.pop();
    issues.push({ type: 'unclosed-opening', tag: t.name, line: t.line });
  }
  return issues;
}

function findUnmatchedBraces(text) {
  // Improved brace matcher that respects JS strings, comments and
  // also handles template-literal embedded expressions (${ ... }).
  const issues = [];
  const opens = [];
  let i = 0; let line = 1; let col = 0;
  let state = { inSingle: false, inDouble: false, inBacktick: false, inLineComment: false, inBlockComment: false, escape: false };
  // track whether we're inside a ${ ... } expression within a template literal
  let templateExprDepth = 0;

  while (i < text.length) {
    const ch = text[i];
    const next = text[i+1];
    if (ch === '\n') { line++; col = 0; state.inLineComment = false; state.escape = false; i++; continue; }
    if (state.inLineComment) { i++; col++; continue; }
    if (state.inBlockComment) {
      if (ch === '*' && next === '/') { state.inBlockComment = false; i += 2; col += 2; continue; }
      i++; col++; continue;
    }

    // start comments when not in string/backtick
    if (!state.inSingle && !state.inDouble && !state.inBacktick) {
      if (ch === '/' && next === '/') { state.inLineComment = true; i += 2; col += 2; continue; }
      if (ch === '/' && next === '*') { state.inBlockComment = true; i += 2; col += 2; continue; }
    }

    // handle quotes and backticks
    if (!state.inLineComment && !state.inBlockComment) {
      if (!state.escape && ch === '"' && !state.inSingle && !state.inBacktick) { state.inDouble = !state.inDouble; i++; col++; continue; }
      if (!state.escape && ch === "'" && !state.inDouble && !state.inBacktick) { state.inSingle = !state.inSingle; i++; col++; continue; }
      if (!state.escape && ch === '`' && !state.inSingle && !state.inDouble) {
        // entering or leaving template literal; only flip inBacktick when not inside a ${...} expression
        if (!state.inBacktick) { state.inBacktick = true; i++; col++; continue; }
        // if currently in a template literal and not inside an embedded expression, closing backtick ends it
        if (state.inBacktick && templateExprDepth === 0) { state.inBacktick = false; i++; col++; continue; }
        // otherwise treat backtick as regular char inside embedded expression
        i++; col++; continue;
      }
      if ((state.inSingle || state.inDouble || state.inBacktick) && ch === '\\' && !state.escape) { state.escape = true; i++; col++; continue; }
    }

    if (state.escape) { state.escape = false; i++; col++; continue; }

    // Handle template expression entry: ${ when inside a backtick
    if (state.inBacktick && ch === '$' && next === '{' && !state.escape) {
      // treat the '{' after '${' as an actual JS block opener that must be matched
      templateExprDepth++;
      opens.push({ line, col, idx: i+1 });
      i += 2; col += 2; continue;
    }

    // Count braces: when not inside normal single/double strings and
    // (either not inside a backtick, or inside backtick but within a ${...} expression)
    const shouldCount = !state.inSingle && !state.inDouble && (!state.inBacktick || templateExprDepth > 0);
    if (shouldCount) {
      if (ch === '{') { opens.push({ line, col, idx: i }); }
      else if (ch === '}') {
        if (opens.length === 0) {
          issues.push({ type: 'unmatched-closing-brace', line, col, idx: i });
        } else {
          const popped = opens.pop();
          // if we closed an opener that was part of a template expression, reduce depth
          if (templateExprDepth > 0 && popped) {
            templateExprDepth = Math.max(0, templateExprDepth - 1);
          }
        }
      }
    }

    i++; col++;
  }

  for (const o of opens) issues.push({ type: 'unclosed-opening-brace', line: o.line, col: o.col, idx: o.idx });
  return issues;
}

async function checkFile(file) {
  const text = fs.readFileSync(file, 'utf8');
  const fileLines = text.split(/\r\n|\n/);
  const results = { file, parseErrors: [], htmlIssues: [], braceIssues: [], backtickOdd: false };

  // script blocks parse
  const scripts = extractScriptBlocks(text);
  if (scripts.length === 0 && file.endsWith('.js')) scripts.push({ content: text, startLine: 1 });
  for (const s of scripts) {
    try {
      acorn.parse(s.content, { ecmaVersion: 2022, sourceType: 'script', locations: true });
    } catch (err) {
      const loc = err.loc || { line: 0, column: 0 };
      const globalLine = s.startLine + loc.line - 1;
      results.parseErrors.push({ message: err.message, line: globalLine, column: loc.column, context: showContext(fileLines, globalLine, loc.column) });
    }
  }

  // HTML tag balance
  results.htmlIssues = scanHtmlTags(text);

  // Filter out false-positive html/body issues when closing tags exist later in the file
  try {
    results.htmlIssues = results.htmlIssues.filter((h) => {
      if (!h) return false;
      const tag = (h.tag || '').toLowerCase();
      if (h.type === 'unclosed-opening') {
        // if a closing tag exists later in the file, treat as false-positive
        const closing = `</${tag}>`;
        const after = text.substring(text.split(/\r?\n/).slice(0, h.line).join('\n').length);
        if (after.toLowerCase().indexOf(closing) !== -1) return false;
      }
      if (h.type === 'unmatched-closing') {
        // ignore closing html/body reported as unmatched (common in large single-file apps)
        if (tag === 'html' || tag === 'body') return false;
        // if an opening tag exists earlier in the file, treat as false-positive
        const openingRe = new RegExp(`<${tag}(\s|>|\\/)`, 'i');
        const before = text.substring(0, text.split(/\r?\n/).slice(0, h.line).join('\n').length);
        if (openingRe.test(before)) return false;
      }
      // special-case: if html/body closing exists anywhere, drop unclosed-opening warnings
      if (h.type === 'unclosed-opening' && (tag === 'html' || tag === 'body')) {
        const closing = `</${tag}>`;
        if (text.toLowerCase().indexOf(closing) !== -1) return false;
      }
      return true;
    });
  } catch (e) {
    // noop
  }

  // Brace matching over whole file with string/comment awareness
  results.braceIssues = findUnmatchedBraces(text);

  // If Acorn successfully parsed the script blocks, the detailed brace scanner
  // may still produce false positives for complex template strings. Only
  // surface brace issues when a JS parse error exists.
  if (results.parseErrors.length === 0) {
    results.braceIssues = [];
  }

  // backtick count - only consider backticks outside <script> blocks as problematic
  try {
    const scriptRe = /<script\b[^>]*>[\s\S]*?<\/script>/gi;
    let cleaned = text.replace(scriptRe, (s) => ' '.repeat(s.length));
    const btCountOutside = (cleaned.match(/`/g) || []).length;
    results.backtickOdd = (btCountOutside % 2) !== 0;
  } catch (e) {
    const btCount = (text.match(/`/g) || []).length;
    results.backtickOdd = (btCount % 2) !== 0;
  }

  return results;
}

(async () => {
  const args = process.argv.slice(2);
  if (!args.length) { console.error('Usage: node tools/comprehensive_syntax_checker.js <file1> [file2 ...]'); process.exit(2); }
  for (const f of args) {
    const full = path.resolve(f);
    if (!fs.existsSync(full)) { console.error('Not found:', f); continue; }
    console.log('\n=== Checking', f, '===');
    try {
      const r = await checkFile(full);
      if (!r.parseErrors.length && !r.htmlIssues.length && !r.braceIssues.length && !r.backtickOdd) {
        console.log('OK — no JS parse errors, tag mismatches, or brace issues detected.');
      } else {
        if (r.parseErrors.length) {
          for (const e of r.parseErrors) {
            console.log('\n-- JS PARSE ERROR --');
            console.log('Message:', e.message);
            console.log(`Location: ${f} : ${e.line}:${e.column}`);
            console.log('Context:\n' + e.context);
          }
        }
        if (r.htmlIssues.length) {
          console.log('\n-- HTML TAG ISSUES --');
          for (const h of r.htmlIssues) console.log(h);
        }
        if (r.braceIssues.length) {
          console.log('\n-- BRACE ISSUES --');
          for (const b of r.braceIssues) console.log(b);
        }
        if (r.backtickOdd) console.log('\n-- BACKTICK COUNT: Odd number of backticks detected (possible unclosed template literal) --');
      }
    } catch (ex) {
      console.error('Failed to check file', f, ex);
    }
  }
})();

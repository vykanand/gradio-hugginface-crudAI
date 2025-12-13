const vm = require('vm');

// Allowed helpers that logic snippets can use
const helpers = {
  math: {
    add: (a,b)=>a+b,
    subtract: (a,b)=>a-b,
    multiply: (a,b)=>a*b,
    divide: (a,b)=>a/b,
    modulo: (a,b)=>a%b,
    sum: (arr)=>arr.reduce((s,x)=>s+(Number(x)||0),0),
    average: (arr)=> arr.length? (arr.reduce((s,x)=>s+(Number(x)||0),0)/arr.length):0
  },
  date: {
    now: ()=>new Date().toISOString()
  }
};

async function evalSnippet(snippet, contextVars) {
  // Build sandbox with only context and helpers
  const sandbox = { context: contextVars || {}, helpers, result: null };
  const scriptText = `result = (async function(context, helpers){\n${snippet}\n})(context, helpers)`;
  const script = new vm.Script(scriptText, { timeout: 1000 });
  const ctx = vm.createContext(sandbox);
  try {
    const res = script.runInContext(ctx, { timeout: 1000 });
    // res is a Promise because wrapper is async; await it
    const value = await Promise.resolve(res);
    // result should be set in sandbox
    return { ok: true, output: ctx.result !== undefined ? ctx.result : value };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

module.exports = { evalSnippet };

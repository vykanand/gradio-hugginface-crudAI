const http = require('http');
const https = require('https');
const path = require('path');

// Resolve AI endpoint from config file first, then env, then fallback default.
let AI_ENDPOINT;
let AI_ENDPOINT_SOURCE = 'default';
try {
  const cfg = require(path.join(__dirname, 'config', 'ai-config.js'));
  if (cfg && cfg.AI_ENDPOINT) {
    AI_ENDPOINT = cfg.AI_ENDPOINT;
    AI_ENDPOINT_SOURCE = 'config_file';
  }
} catch (e) {
  // no config file
}
if (!AI_ENDPOINT) {
  if (process.env.AI_ENDPOINT) {
    AI_ENDPOINT = process.env.AI_ENDPOINT;
    AI_ENDPOINT_SOURCE = 'env';
  } else {
    AI_ENDPOINT = 'https://gradio-hugginface-aiserver-production.up.railway.app/large';
    AI_ENDPOINT_SOURCE = 'default';
  }
}

function truncate(str, n = 2000) {
  if (!str) return str;
  const s = String(str);
  return s.length > n ? s.slice(0, n) + '...[truncated]' : s;
}

function postJson(targetUrl, payload, timeout = 60000) {
  return new Promise((resolve, reject) => {
    try {
      const urlObj = new URL(targetUrl);
      const lib = urlObj.protocol === 'https:' ? https : http;
      const options = {
        hostname: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? 443 : 80),
        path: urlObj.pathname + (urlObj.search || ''),
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout
      };

      // Log request
      try {
        console.log('[aiService] ->', options.method, targetUrl);
        console.log('[aiService] payload:', truncate(JSON.stringify(payload)));
      } catch (e) {}

      const req = lib.request(options, (res) => {
        let data = '';
        res.on('data', (chunk) => (data += chunk));
        res.on('end', () => {
          const ct = res.headers['content-type'] || '';
          const out = { statusCode: res.statusCode, headers: res.headers, data: null };
          if (ct.includes('application/json')) {
            try {
              out.data = JSON.parse(data);
            } catch (e) {
              out.data = data;
            }
          } else {
            out.data = data;
          }

          try {
            console.log('[aiService] <-', res.statusCode, truncate(JSON.stringify(out.data)));
          } catch (e) {}

          resolve(out);
        });
      });

      req.on('error', (err) => {
        console.error('[aiService] request error:', err && err.message);
        reject(err);
      });
      req.on('timeout', () => {
        const err = new Error('Request timed out');
        console.error('[aiService] timeout');
        req.destroy(err);
        reject(err);
      });

      req.write(JSON.stringify(payload || {}));
      req.end();
    } catch (e) {
      reject(e);
    }
  });
}

async function requestAI(payload, timeout = 60000) {
  return await postJson(AI_ENDPOINT, payload, timeout);
}

async function healthCheck() {
  // Use a minimal prompt for a lightweight health check
  const sample = { sessionId: 'healthcheck', aiquestion: 'hi' };
  try {
    console.log('[aiService] healthCheck ->', AI_ENDPOINT);
    const resp = await postJson(AI_ENDPOINT, sample, 15000);
    const ok = resp && resp.statusCode >= 200 && resp.statusCode < 300;
    
    if (ok) {
      return { ok: true, statusCode: resp.statusCode, data: resp.data };
    }
    
    // Non-2xx response - include error details in diagnostics
    const errorMsg = resp.data && resp.data.message ? resp.data.message : 
                     resp.data && resp.data.error ? resp.data.error :
                     `HTTP ${resp.statusCode}`;
    
    return { 
      ok: false, 
      statusCode: resp.statusCode, 
      error: errorMsg,
      data: resp.data,
      diagnostics: {
        statusCode: resp.statusCode,
        url: AI_ENDPOINT,
        response: resp.data,
        message: errorMsg,
        type: 'http_error'
      }
    };
  } catch (e) {
    const diag = {
      message: e.message || String(e),
      code: e.code || null,
      errno: e.errno || null,
      stack: e.stack || null,
    };

    try {
      const dns = require('dns');
      const parsed = new URL(AI_ENDPOINT);
      const host = parsed.hostname;
      diag.dns = await new Promise((resolve) => {
        dns.lookup(host, (err, address, family) => {
          if (err) return resolve({ ok: false, error: err.message });
          return resolve({ ok: true, address, family });
        });
      });
    } catch (dnsErr) {
      diag.dns = { ok: false, error: dnsErr.message || String(dnsErr) };
    }

    return { ok: false, error: e.message || String(e), diagnostics: diag };
  }
}

module.exports = { AI_ENDPOINT, AI_ENDPOINT_SOURCE, requestAI, healthCheck };

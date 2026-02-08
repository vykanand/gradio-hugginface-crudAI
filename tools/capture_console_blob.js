(async () => {
  try {
    let playwright;
    try { playwright = require('playwright'); } catch (e) { }
    if (!playwright) {
      try { const pwtest = require('@playwright/test'); playwright = pwtest.playwright || null; } catch (e) { }
    }
    if (!playwright) {
      console.error('Playwright not available (require failed). Please install Playwright.');
      process.exit(2);
    }

    const browser = await playwright.chromium.launch({ headless: true });
    const context = await browser.newContext();
    const page = await context.newPage();

    page.on('console', async (msg) => {
      try {
        const text = msg.text();
        console.log('[console]', msg.type(), text);
        const m = text.match(/(blob:\/\/[^\s"']+)/);
        if (m) {
          const blobUrl = m[1];
          console.log('Found blob url in console:', blobUrl);
          try {
            const code = await page.evaluate(async (u) => { try { const r = await fetch(u); return await r.text(); } catch (e) { return 'FETCH_FAILED: ' + String(e); } }, blobUrl);
            console.log('--- Blob content start ---\n' + code.substring(0, 2000) + '\n--- Blob content end (truncated) ---');
            await browser.close();
            process.exit(0);
          } catch (e) {
            console.error('Failed to fetch blob content:', e);
          }
        }
      } catch (e) { console.error('console handler error', e); }
    });

    page.on('pageerror', (err) => {
      console.error('[pageerror]', err && err.stack ? err.stack : String(err));
    });

    page.on('requestfailed', req => console.log('[requestfailed]', req.url(), req.failure() && req.failure().errorText));

    const url = process.env.URL || 'http://localhost:5050/orchestration-builder.html';
    console.log('Navigating to', url);
    // Install error hook and intercept URL.createObjectURL before any page scripts run
    await page.addInitScript(() => {
      window.__capturedErrors = window.__capturedErrors || [];
      window.addEventListener('error', function (ev) {
        try {
          const info = { message: ev.message, filename: ev.filename, lineno: ev.lineno, colno: ev.colno, stack: (ev.error && ev.error.stack) || null };
          window.__capturedErrors.push(info);
          try { console.error('PAGE_ERROR_HOOK:' + JSON.stringify(info)); } catch(e) { /* ignore */ }
        } catch (e) { /* ignore */ }
      });
      window.addEventListener('unhandledrejection', function (ev) {
        try {
          const info = { message: (ev && ev.reason && ev.reason.message) || String(ev.reason), filename: null, lineno: null, colno: null, stack: (ev && ev.reason && ev.reason.stack) || null };
          window.__capturedErrors.push(info);
          try { console.error('PAGE_REJECTION_HOOK:' + JSON.stringify(info)); } catch(e) { }
        } catch (e) { }
      });

      // Intercept createObjectURL so we can capture blob contents before they may be revoked
      try {
        const origCreate = URL.createObjectURL.bind(URL);
        URL.__createObjectURL__ = origCreate;
        URL.createObjectURL = function (blob) {
          try {
            const url = origCreate(blob);
            // attempt to read blob.text() asynchronously and store on window for diagnostics
            try {
              blob.text().then(t => {
                window.__blobTexts = window.__blobTexts || {};
                try { window.__blobTexts[url] = t; } catch (e) { /* ignore */ }
              }).catch(() => {});
            } catch (e) {}
            return url;
          } catch (e) {
            return origCreate(blob);
          }
        };
      } catch (e) { /* ignore */ }
    });

    await page.goto(url, { waitUntil: 'load', timeout: 60000 });

    // Click each top-level tab to trigger lazy-loading fragments
    try {
      await page.evaluate(() => {
        const tabs = Array.from(document.querySelectorAll('.tab'));
        tabs.forEach((t, i) => {
          setTimeout(() => { try { t.click(); } catch(e){} }, 200 * i);
        });
      });
    } catch (e) { console.warn('tab click eval failed', e); }

    // wait for console messages while fragments load
    await page.waitForTimeout(8000);

    console.log('No blob console message captured within timeout. Attempting to locate dynamic scripts...');
    // Find any script elements with blob: src
    const blobs = await page.evaluate(() => {
      const scripts = Array.from(document.querySelectorAll('script')).map(s => ({ src: s.src || null, text: s.textContent && s.textContent.length > 200 ? s.textContent.slice(0,200) + '...': s.textContent }));
      return scripts.filter(s => s.src && s.src.startsWith('blob:'));
    });
    if (blobs && blobs.length) {
      console.log('Found', blobs.length, 'blob scripts. Fetching first...');
      // Try to print any captured blob texts from intercepted createObjectURL
      const captured = await page.evaluate(() => {
        try { return window.__blobTexts || null; } catch (e) { return null; }
      });
      if (captured && typeof captured === 'object') {
        const keys = Object.keys(captured);
        console.log('Captured blob keys:', keys.length);
        for (const k of keys) {
          console.log('--- Blob key:', k, '---');
          console.log(captured[k].slice(0, 4000));
          console.log('--- End blob ---');
        }
      } else {
        const code = await page.evaluate(async (u) => { try { const r = await fetch(u); return await r.text(); } catch (e) { return 'FETCH_FAILED: ' + String(e); } }, blobs[0].src);
        console.log('--- Blob script content (first 4000 chars) ---\n' + (code && code.slice ? code.slice(0,4000) : String(code)));
      }
    } else {
      console.log('No blob scripts found in DOM.');
    }

    await browser.close();
    process.exit(0);
  } catch (err) {
    console.error('Script failed', err && err.stack ? err.stack : err);
    process.exit(3);
  }
})();

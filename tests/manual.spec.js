const { test, expect } = require('@playwright/test');

test.use({ headless: false, viewport: { width: 1400, height: 900 } });

test('Manual interactive: Custom Logic tab check (headed)', async ({ page, baseURL }) => {
  page.on('console', (msg) => console.log('PAGE LOG', msg.type(), msg.text()));
  page.on('pageerror', (err) => console.log('PAGE ERROR', err));

  const url = (baseURL || 'http://localhost:5050') + '/orchestration-builder.html';
  console.log('Opening', url);
  await page.goto(url, { waitUntil: 'domcontentloaded' });

  // Open Custom Logic tab
  await page.click('button.tab:has-text("Custom Logic")');
  await page.waitForSelector('#custom-logic-panel', { state: 'visible', timeout: 5000 });

  // If fragment init not present, inject fragment HTML and execute scripts
  const hasInit = await page.evaluate(() => typeof window.initCustomLogicTab === 'function');
  console.log('initCustomLogicTab present:', hasInit);
  if (!hasInit) {
    console.log('Injecting fragment manually');
    await page.evaluate(async () => {
      try {
        const res = await fetch('builder-tabs/custom-logic-tab.html');
        const text = await res.text();
        const wrapper = document.createElement('div');
        wrapper.innerHTML = text;

        // move non-script nodes into body (preserve structure)
        const scripts = wrapper.querySelectorAll('script');
        // append rest
        Array.from(wrapper.childNodes).forEach((n) => {
          if (n.tagName !== 'SCRIPT') document.body.appendChild(n);
        });

        // Inject scripts in order
        for (const s of scripts) {
          const ns = document.createElement('script');
          if (s.type) ns.type = s.type;
          // copy attributes
          for (const a of Array.from(s.attributes || [])) ns.setAttribute(a.name, a.value);
          if (s.src) {
            ns.src = s.src;
            ns.async = false;
            document.head.appendChild(ns);
            await new Promise((r) => (ns.onload = r));
          } else {
            ns.textContent = s.textContent;
            document.head.appendChild(ns);
          }
        }

        console.log('fragment injected');
      } catch (e) {
        console.error('fragment injection failed', e);
      }
    });
  }

  // Call init hook if available
  const callable = await page.evaluate(() => typeof window.initCustomLogicTab === 'function');
  console.log('init hook available after inject:', callable);
  if (callable) {
    await page.evaluate(() => window.initCustomLogicTab && window.initCustomLogicTab());
  }

  // Wait a bit for UI to render
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/screenshots/custom-logic-initial.png' });

  // Instead of creating a new logic, select an existing workflow-scoped logic
  await page.evaluate(() => { window.currentWorkflow = { id: 'wf_1769809382007', name: 'wf_1769809382007' }; window.nodes = window.nodes || []; });
  await page.waitForFunction(() => {
    const list = document.getElementById('custom-logic-list');
    if (!list) return false;
    return Array.from(list.querySelectorAll('*')).some(n => /check email/i.test(n.innerText || ''));
  }, { timeout: 5000 });
  await page.evaluate(() => {
    const list = document.getElementById('custom-logic-list');
    const node = Array.from(list.querySelectorAll('*')).find(n => /check email/i.test(n.innerText || ''));
    if (node) node.click();
  });
  await page.evaluate(() => {
    window.nodes = window.nodes || [];
    window.nodes.push({ id: 'connect_manual_1', type: 'connect', data: { logicId: 'logic_example_test_action_one', connectorName: 'manualConnector' } });
  });
  await page.waitForSelector('#custom-logic-connect-inputs button:has-text("Attach")', { timeout: 5000 });
  await page.click('#custom-logic-connect-inputs button:has-text("Attach")');
  await page.waitForTimeout(800);
  await page.screenshot({ path: 'tests/screenshots/custom-logic-attached.png' });

  // Run Test
  const testData = { hello: 'world' };
  await page.fill('#logic-test-data', JSON.stringify(testData, null, 2));
  await page.click('#custom-logic-panel button:has-text("Run Test")');
  await page.waitForSelector('#logic-test-result', { state: 'visible', timeout: 5000 });
  const resultText = await page.$eval('#logic-test-result', (el) => el.innerText);
  console.log('Test result text:', resultText.substring(0, 400));
  await page.screenshot({ path: 'tests/screenshots/custom-logic-result.png' });

  expect(resultText).toContain('Execution Successful');
});

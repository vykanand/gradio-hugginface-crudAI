const { test, expect } = require('@playwright/test');

test.describe('Custom Logic attach inputs flow', () => {
  test('attach inputs from simulated Connect nodes', async ({ page, baseURL }) => {
    await page.goto((baseURL || 'http://localhost:5050') + '/orchestration-builder.html');

    // Open Custom Logic tab
    page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));

    await page.click('button.tab:has-text("Custom Logic")');
    await page.waitForSelector('#custom-logic-panel', { state: 'visible' });
    await page.waitForFunction(() => typeof window.initCustomLogicTab === 'function');
    await page.evaluate(() => window.initCustomLogicTab && window.initCustomLogicTab());

    // Ensure a workflow context is present so fragment loads per-workflow components
    await page.evaluate(() => { window.currentWorkflow = { id: 'wf_1769809382007', name: 'wf_1769809382007' }; window.nodes = window.nodes || []; });
    // Select an existing workflow-scoped logic (we expect 'check email and phone number valid format')
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

    // Simulate Connect nodes attached to the workflow for that logic id
    await page.evaluate(() => {
      window.nodes = window.nodes || [];
      window.nodes.push({ id: 'connect_1', type: 'connect', data: { logicId: 'logic_example_test_action_one', connectorName: 'sampleConnector' } });
    });

    // Click Attach on the rendered connect-inputs pill
    await page.waitForSelector('#custom-logic-connect-inputs button:has-text("Attach")', { timeout: 5000 });
    await page.click('#custom-logic-connect-inputs button:has-text("Attach")');

    // Wait for schema preview to update
    await page.waitForFunction(() => {
      const el = document.getElementById('input-shape-schema');
      return el && el.textContent && el.textContent.length > 0 && !el.textContent.includes('No inputs defined');
    }, { timeout: 5000 });

    const schemaText = await page.$eval('#input-shape-schema', (el) => el.textContent);
    expect(schemaText).toBeTruthy();
  });
});

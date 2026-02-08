const { test, expect } = require('@playwright/test');

test.describe('Workflow-scoped explorers follow active workflow', () => {
  test('Custom Logic empty and Actions show workflow actions', async ({ page, baseURL }) => {
    const url = (baseURL || 'http://localhost:5050') + '/orchestration-builder.html';
    await page.goto(url);

    // Mirror page console to test output for debugging
    page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));

    // Seed active workflow to a known workflow id in config/metadata/workflows.json via host API
    await page.waitForFunction(() => typeof window.setCurrentWorkflow === 'function');
    await page.evaluate(() => { window.nodes = window.nodes || []; });
    await page.evaluate(() => window.setCurrentWorkflow({ id: 'invoice-processing', name: 'Invoice Processing' }));

    // Open Custom Logic tab and initialize fragment
    await page.click('button.tab:has-text("Custom Logic")');
    await page.waitForSelector('#custom-logic-panel', { state: 'visible' });
    await page.waitForFunction(() => typeof window.initCustomLogicTab === 'function');
    await page.evaluate(() => window.initCustomLogicTab && window.initCustomLogicTab());

    // Custom Logic explorer should be present but for this workflow there are no custom logics
    const customItems = await page.$$('#custom-logic-list .list-item');
    expect(customItems.length).toBe(0);

    // Open Actions tab and ensure actions list contains items referenced by the workflow
    await page.click('button.tab:has-text("Actions")');
    await page.waitForSelector('#actions-panel-list', { state: 'visible' });

    // Wait for actions panel to render some content (robust against varying markup)
    await page.waitForFunction(() => {
      const el = document.getElementById('actions-panel-list');
      if (!el) return false;
      const txt = (el.innerText || '').trim();
      if (!txt) return false;
      if (/loading/i.test(txt)) return false;
      return true;
    }, { timeout: 8000 });

    // Find a first clickable child inside the actions panel
    const firstAction = await page.$('#actions-panel-list [data-action-id], #actions-panel-list .list-item, #actions-panel-list > div');
    expect(firstAction).not.toBeNull();
    await firstAction.click();
    await page.waitForSelector('#action-editor-title:has-text("Editing:")', { timeout: 3000 });
    const nameVal = await page.$eval('#action-name', (el) => el.value || '');
    expect(nameVal.length).toBeGreaterThan(0);
  });
});

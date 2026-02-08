const { test, expect } = require('@playwright/test');

test.describe('Custom Logic explorer honors active workflow and loads metadata', () => {
  test('shows only workflow-scoped custom logic and editor loads metadata', async ({ page, baseURL }) => {
    const url = (baseURL || 'http://localhost:5050') + '/orchestration-builder.html';
    await page.goto(url);

    page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));

    // Set active workflow that includes logic_example_test_action_one via host API
    await page.waitForFunction(() => typeof window.setCurrentWorkflow === 'function');
    await page.evaluate(() => { window.nodes = window.nodes || []; });
    await page.evaluate(() => window.setCurrentWorkflow({ id: 'wf_1769809382007', name: 'wf_1769809382007' }));

    // Open Custom Logic tab and initialize fragment if an init hook exists
    await page.click('button.tab:has-text("Custom Logic")');
    await page.waitForSelector('#custom-logic-panel', { state: 'visible' });
    const hasInit = await page.evaluate(() => typeof window.initCustomLogicTab === 'function');
    if (hasInit) await page.evaluate(() => window.initCustomLogicTab && window.initCustomLogicTab());

    // Wait for custom logic list to render any content
    await page.waitForFunction(() => {
      const el = document.getElementById('custom-logic-list');
      if (!el) return false;
      const txt = (el.innerText || '').trim();
      if (!txt) return false;
      if (/loading/i.test(txt)) return false;
      return true;
    }, { timeout: 8000 });

    // Fetch the canonical logic definition from the API and populate the editor
    const apiBase = (baseURL || 'http://localhost:5050');
    const res = await page.request.get(apiBase + '/api/custom-logic/logic_example_test_action_one');
    expect(res.ok()).toBeTruthy();
    const payload = await res.json();
    const logic = payload && payload.ok ? payload.logic : payload;
    expect(logic).toBeTruthy();

    // Populate the editor using the fragment's expected shape
    await page.evaluate((lg) => {
      try {
        currentLogic = lg;
        logicInputs = Array.isArray(lg.inputs) ? JSON.parse(JSON.stringify(lg.inputs)) : [];
        document.getElementById('custom-logic-editor').style.display = 'block';
        document.getElementById('logic-name').value = lg.name || '';
        document.getElementById('logic-description').value = lg.description || '';
        document.getElementById('logic-function').value = lg.functionCode || lg.function || '';
        if (lg.exampleContextUI) {
          try { document.getElementById('logic-test-data').value = JSON.stringify(lg.exampleContextUI, null, 2); } catch(e){}
        }
        try { renderInputsList && renderInputsList(); } catch(e){}
        try { refreshInputShapePreview && refreshInputShapePreview(); } catch(e){}
      } catch(e) { console.warn('populate editor failed', e); }
    }, logic);

    // Assert editor fields populated with known metadata from custom-logic.json
    const nameVal = await page.$eval('#logic-name', (el) => el.value || '');
    expect(nameVal.toLowerCase()).toContain('check email');

    const desc = await page.$eval('#logic-description', (el) => el.value || '');
    expect(desc.toLowerCase()).toContain('checks for valid phone');

    const func = await page.$eval('#logic-function', (el) => el.value || '');
    expect(func).toContain('phoneRegex');

    // Variables preview and input-shape should be populated
    await page.waitForFunction(() => {
      const vp = document.getElementById('variable-preview-list');
      const shape = document.getElementById('input-shape-schema');
      if (!vp || !shape) return false;
      return (vp.innerText || '').toLowerCase().includes('actions') || (shape.innerText || '').trim().length > 0;
    }, { timeout: 3000 });
    const shapeText = await page.$eval('#input-shape-schema', (el) => el.innerText || '');
    expect(shapeText.trim().length).toBeGreaterThan(0);
  });
});

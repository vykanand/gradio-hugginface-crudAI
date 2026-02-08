const { test, expect } = require('@playwright/test');

// This test assumes your dev server is already running at http://localhost:5050
// It does NOT start or stop the server.

test.describe('Custom Logic tab basic flow', () => {
  test('open Custom Logic, create/ save and run a simple logic', async ({ page, baseURL }) => {
    // Navigate to orchestration builder
    await page.goto((baseURL || 'http://localhost:5050') + '/orchestration-builder.html');

    // Open Custom Logic tab by text
    // Mirror page console to test output for debugging
    page.on('console', (msg) => console.log('PAGE LOG:', msg.type(), msg.text()));

    await page.click('button.tab:has-text("Custom Logic")');
    await page.waitForSelector('#custom-logic-panel', { state: 'visible' });
      // Wait until the fragment's init hook is available and call it (parent does this normally)
      await page.waitForFunction(() => typeof window.initCustomLogicTab === 'function');
      await page.evaluate(() => window.initCustomLogicTab && window.initCustomLogicTab());

    // Click New Logic
    await page.click('#custom-logic-panel .toolbar button:has-text("➕ New Logic")');

    // Wait for editor inputs to appear (ensures fragment script initialized)
    await page.waitForSelector('#logic-name', { state: 'visible' });

    // Fill form
    const name = 'playwright_test_logic_' + Date.now();
    await page.fill('#logic-name', name);
    await page.fill('#logic-description', 'Playwright test logic - returns inputs');

    // Simple function body that returns the inputs object
    await page.fill('#logic-function', 'return inputs;');

    // Populate test data
    const testData = { foo: 'bar', nested: { num: 42 } };
    await page.fill('#logic-test-data', JSON.stringify(testData, null, 2));

    // Intercept alert dialogs produced by showToast (alert)
    page.on('dialog', async (dialog) => {
      await dialog.accept();
    });

    // Save logic
    await page.click('#custom-logic-panel button:has-text("Save")');

    // Wait a short time for save + reload list
    await page.waitForTimeout(1200);

    // Run test
    await page.click('#custom-logic-panel button:has-text("Run Test")');

    // Wait for result panel
    const result = await page.waitForSelector('#logic-test-result', { state: 'visible', timeout: 10000 });
    const text = await result.innerText();

    // Assert execution successful
    expect(text).toContain('Execution Successful');
    expect(text).toContain('"foo": "bar"');
    expect(text).toContain('"num": 42');
  });
});

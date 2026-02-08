# TODO: Fix switchTab SyntaxError and Custom Logic Explorer Issues

## Issues Identified

### Issue 1: SyntaxError at switchTab (line 5861)

- Error: "await is only valid in async functions and the top level bodies of modules"
- Cause: When loading custom-logic-tab.html, the script contains top-level `await` that causes parsing error
- Location: orchestration-builder.html line 5861

### Issue 2: Custom Logic list items not showing in explorer

- Cause: explorer.js relies on `window.nodes` being available
- If workflow isn't loaded or `nodes` is undefined/empty, no items display

## Fix Plan

### Fix 1: Improve switchTab error handling for top-level await

- Wrap the inline script execution in better try-catch
- Use `type="module"` for scripts with top-level await
- Handle all error cases properly

### Fix 2: Improve explorer.js to handle undefined nodes

- Add null check for `window.nodes`
- Handle case when nodes is undefined or not loaded
- Provide fallback behavior

## Implementation Steps

- [ ] Fix switchTab function in orchestration-builder.html
  - [ ] Improve try-catch for script execution with top-level await
  - [ ] Use proper module type handling
- [ ] Fix explorer.js to handle undefined nodes
  - [ ] Add null check for window.nodes
  - [ ] Provide fallback when nodes not available

## Files to Modify

- c:/dev/gradio-hugginface-crudAI/orchestration-builder.html
- c:/dev/gradio-hugginface-crudAI/assets/explorer.js

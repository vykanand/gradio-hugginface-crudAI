// Minimal reusable explorer widget
(function () {
  function normalizeItems(payload) {
    if (!payload) return [];
    // Accept array, map/object, or envelope { ok, data, items }
    if (Array.isArray(payload)) return payload;
    if (payload && typeof payload === 'object') {
      if (payload.items && Array.isArray(payload.items)) return payload.items;
      if (payload.data && Array.isArray(payload.data)) return payload.data;
      if (payload.logics && Array.isArray(payload.logics)) return payload.logics;
      if (payload.actions && Array.isArray(payload.actions)) return payload.actions;
      // If payload.logics is an object map, prefer its values
      if (payload.logics && typeof payload.logics === 'object') return Object.values(payload.logics);
      if (payload.actions && typeof payload.actions === 'object') return Object.values(payload.actions);
      // If it's an object map, return values
      return Object.values(payload);
    }
    return [];
  }

  function getConnectedNodesForItem(item, nodeTypeMatch) {
    try {
      const allNodes = window.nodes || [];
      const matches = [];
      allNodes.forEach((n) => {
        if (!n || !n.type) return;
        if (nodeTypeMatch && n.type !== nodeTypeMatch) return;
        const data = n.data || {};
        // common linkage keys: logicId, action, actionId
        if (String(data.logicId) === String(item.id) || String(data.logicId) === String(item.name) || String(data.action) === String(item.id) || String(data.actionId) === String(item.id) || String(data.action) === String(item.name)) {
          matches.push(n);
        }
      });
      return matches;
    } catch (e) {
      return [];
    }
  }

  function renderList(container, items, opts) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
      container.innerHTML = '<div style="color:#666;padding:8px">No items</div>';
      return;
    }
    items.forEach((it) => {
      const line = document.createElement('div');
      line.style.cssText = 'padding:8px;border-bottom:1px solid #eee;cursor:pointer;';
      const label = (opts && opts.itemLabel) ? opts.itemLabel(it) : (it.name || it.id || '(untitled)');
      line.textContent = label;

      // connected badge
      try {
        const matches = getConnectedNodesForItem(it, opts && opts.nodeTypeMatch);
        if (matches && matches.length) {
          const badge = document.createElement('span');
          badge.style.cssText = 'float:right;font-size:0.8rem;color:#555';
          badge.textContent = `${matches.length} connected`;
          line.appendChild(badge);
        }
      } catch (e) {}

      line.onclick = () => {
        if (opts && typeof opts.onSelect === 'function') opts.onSelect(it);
      };

      container.appendChild(line);
    });
  }

  async function createExplorer(options) {
    // options: { containerId, fetchItems, itemLabel, nodeTypeMatch, onSelect }
    const container = typeof options.containerId === 'string' ? document.getElementById(options.containerId) : options.containerId;
    if (!container) throw new Error('Explorer container not found');

    const refresh = async () => {
      try {
        let payload = null;
        if (typeof options.fetchItems === 'function') payload = await options.fetchItems();
        const items = normalizeItems(payload);
        renderList(container, items, options);
        if (typeof options.onRefresh === 'function') options.onRefresh(items);
      } catch (e) {
        console.error('Explorer refresh error', e);
        container.innerHTML = '<div style="color:#a33;padding:8px">Failed to load</div>';
      }
    };

    // initial
    await refresh();

    return {
      refresh,
      renderList: (items) => renderList(container, items, options)
    };
  }

  window.createExplorer = createExplorer;
})();

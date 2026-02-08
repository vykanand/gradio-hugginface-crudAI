// Reusable connect-inputs utilities
(function () {
  function collectUpstreamConnectNodesForTargets(targetIds) {
    try {
      const allNodes = window.nodes || [];
      const allConnections = window.connections || [];
      const connectNodes = new Map();

      const q = Array.isArray(targetIds) ? targetIds.map(String) : [String(targetIds)];
      const seen = new Set();

      while (q.length) {
        const nid = q.shift();
        allConnections.forEach((c) => {
          if (String(c.to) === String(nid)) {
            const from = (allNodes || []).find((n) => String(n.id) === String(c.from));
            if (!from) return;
            if (from.type === 'connect') {
              connectNodes.set(from.id, from);
            } else if (!seen.has(from.id)) {
              seen.add(from.id);
              q.push(String(from.id));
            }
          }
        });
      }

      return Array.from(connectNodes.values());
    } catch (e) {
      console.warn('collectUpstreamConnectNodesForTargets failed', e);
      return [];
    }
  }

  function renderConnectInputPills(opts) {
    try {
      opts = opts || {};
      const containerId = opts.containerId || 'connect-input-pills-area';
      const container = document.getElementById(containerId);
      if (!container) return;

      const targetIds = opts.targetIds || opts.targetId || [];
      const targets = Array.isArray(targetIds) ? targetIds : [targetIds];
      const connectNodes = collectUpstreamConnectNodesForTargets(targets.filter(Boolean));

      container.innerHTML = '';
      if (!connectNodes || connectNodes.length === 0) {
        const empty = document.createElement('div');
        empty.style.color = '#8899a6';
        empty.style.fontSize = '0.85rem';
        empty.style.textAlign = 'center';
        empty.style.padding = '8px';
        empty.textContent = opts.emptyMessage || 'No Connect inputs detected for this workflow.';
        container.appendChild(empty);
        return;
      }

      const header = document.createElement('div');
      header.style.marginBottom = '8px';
      const hstrong = document.createElement('strong');
      hstrong.textContent = opts.title || 'Connect Inputs (from workflow)';
      header.appendChild(hstrong);
      container.appendChild(header);

      connectNodes.forEach((cn) => {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.justifyContent = 'space-between';
        row.style.alignItems = 'center';
        row.style.padding = '6px 8px';
        row.style.borderBottom = '1px solid #f0f0f0';

        const left = document.createElement('div');
        left.style.flex = '1';
        left.textContent = cn.name || cn.id || '(connect)';

        const right = document.createElement('div');
        right.style.fontSize = '0.85rem';
        right.style.color = '#555';
        const btn = document.createElement('button');
        btn.className = 'btn btn-sm btn-secondary';
        btn.textContent = 'Attach';
        btn.onclick = () => {
          try {
            const cb = opts.onAttach;
            const entry = {
              type: 'action',
              actionId: cn.id,
              actionName: (cn.data && (cn.data.connectorName || cn.data.connector)) || cn.id,
              field: null,
            };
            if (typeof cb === 'function') cb(entry, cn);
          } catch (e) { console.warn('attach button failed', e); }
        };
        right.appendChild(btn);

        row.appendChild(left);
        row.appendChild(right);
        container.appendChild(row);
      });
    } catch (e) {
      console.warn('renderConnectInputPills failed', e);
    }
  }

  window.collectUpstreamConnectNodesForTargets = collectUpstreamConnectNodesForTargets;
  window.renderConnectInputPills = renderConnectInputPills;
})();

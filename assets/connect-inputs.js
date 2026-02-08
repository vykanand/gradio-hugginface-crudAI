// Reusable connect-inputs utilities
(function () {
  function collectUpstreamConnectNodesForTargets(targetIds) {
    try {
      const allNodes = window.nodes || [];
      const allConnections = window.connections || [];
      try {
        console.debug('collectUpstreamConnectNodesForTargets: called', { targetIds: targetIds, nodes: (allNodes || []).length, connections: (allConnections || []).length });
      } catch (e) {}
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

      try {
        console.debug('collectUpstreamConnectNodesForTargets: found connectNodes', Array.from(connectNodes.keys()));
      } catch (e) {}
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
      try { console.debug('renderConnectInputPills: targetIds=', targets, 'connectNodes.len=', (connectNodes||[]).length); } catch(e){}
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

      // For each connect node render per-key draggable pills and an Attach action
      connectNodes.forEach((cn) => {
        const mapping = (cn.data && (cn.data.mapping || {}));
        // Determine preview source (prefer persisted example outputs)
        let preview = {};
        try {
          if (cn.data && cn.data.variableMappings && Array.isArray(cn.data.variableMappings._exampleOutputs) && cn.data.variableMappings._exampleOutputs.length > 0) {
            preview = cn.data.variableMappings._exampleOutputs[0] || {};
          } else if (cn.data && cn.data.mappingPreview && Object.keys(cn.data.mappingPreview || {}).length > 0) {
            preview = cn.data.mappingPreview || {};
          } else if (cn.data && cn.data.examplePayload && Object.keys(cn.data.examplePayload || {}).length > 0) {
            preview = cn.data.examplePayload || {};
          } else {
            preview = {};
          }
        } catch (e) { preview = {}; }

        const title = cn.name || cn.id;
        const keys = Object.keys(mapping).length ? Object.keys(mapping) : (Object.keys(preview).length ? Object.keys(preview) : []);

        const section = document.createElement('div');
        section.style.marginBottom = '10px';

        const titleRow = document.createElement('div');
        titleRow.style.display = 'flex';
        titleRow.style.justifyContent = 'space-between';
        titleRow.style.alignItems = 'center';

        const nameDiv = document.createElement('div');
        nameDiv.style.fontWeight = '600';
        nameDiv.textContent = title;
        titleRow.appendChild(nameDiv);

        const attachBtn = document.createElement('button');
        attachBtn.className = 'btn btn-sm btn-secondary';
        attachBtn.textContent = 'Attach';
        attachBtn.onclick = () => {
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
        titleRow.appendChild(attachBtn);
        section.appendChild(titleRow);

        if (!keys || keys.length === 0) {
          const note = document.createElement('div');
          note.style.color = '#657786';
          note.style.fontSize = '0.85rem';
          note.style.marginTop = '6px';
          note.textContent = `${title} — no mapping defined`;
          section.appendChild(note);
        } else {
          const pillsRow = document.createElement('div');
          pillsRow.style.display = 'flex';
          pillsRow.style.flexWrap = 'wrap';
          pillsRow.style.gap = '8px';
          pillsRow.style.marginTop = '6px';

          keys.forEach((k) => {
            const mappedPath = mapping && mapping[k] ? mapping[k] : k;

            // Resolve sample value for hint
            let sampleVal = undefined;
            function tryResolveFrom(obj) {
              if (!obj) return undefined;
              if (Object.prototype.hasOwnProperty.call(obj, k)) return obj[k];
              if (mapping && mapping[k] && Object.prototype.hasOwnProperty.call(obj, mapping[k])) return obj[mapping[k]];
              return undefined;
            }
            try {
              if (cn.data && cn.data.variableMappings && Array.isArray(cn.data.variableMappings._exampleOutputs) && cn.data.variableMappings._exampleOutputs.length > 0) {
                sampleVal = tryResolveFrom(cn.data.variableMappings._exampleOutputs[0]);
              }
              if (sampleVal === undefined && cn.data && cn.data.mappingPreview && Object.keys(cn.data.mappingPreview || {}).length > 0) {
                sampleVal = tryResolveFrom(cn.data.mappingPreview);
              }
              if (sampleVal === undefined && cn.data && cn.data.examplePayload && Object.keys(cn.data.examplePayload || {}).length > 0) {
                sampleVal = tryResolveFrom(cn.data.examplePayload);
              }
            } catch (e) { /* ignore */ }

            const pill = document.createElement('button');
            pill.className = 'btn btn-sm btn-secondary connect-pill';
            pill.type = 'button';
            pill.draggable = true;
            pill.title = `Drag to insert {{event_parser_${cn.id}.${mappedPath}}}`;
            pill.style.display = 'inline-flex';
            pill.style.alignItems = 'center';
            pill.style.gap = '6px';
            pill.textContent = k;

            if (sampleVal !== undefined) {
              const span = document.createElement('span');
              span.style.color = '#8899a6';
              span.style.fontSize = '0.75rem';
              span.style.marginLeft = '6px';
              span.textContent = String(sampleVal).substring(0, 40);
              pill.appendChild(span);
            }

            pill.addEventListener('dragstart', function (e) {
              try {
                const payload = { eventParserNodeId: cn.id, path: mappedPath, key: k, parserType: 'event_parser' };
                e.dataTransfer.setData('application/json', JSON.stringify(payload));
                const placeholder = `{{event_parser_${cn.id}.${mappedPath}}}`;
                e.dataTransfer.setData('text/plain', placeholder);
                e.dataTransfer.effectAllowed = 'copy';
              } catch (err) { console.warn('connect-pill dragstart failed', err); }
            });

            pill.addEventListener('click', function () {
              try {
                // Default click inserts placeholder into any focused input via global insertAtCursor
                const placeholder = `{{event_parser_${cn.id}.${mappedPath}}}`;
                if (globalThis && typeof globalThis.insertAtCursor === 'function') {
                  const active = document.activeElement;
                  if (active && (active.tagName === 'TEXTAREA' || active.tagName === 'INPUT')) {
                    globalThis.insertAtCursor(active, placeholder);
                  }
                }
              } catch (e) { console.warn(e); }
            });

            pillsRow.appendChild(pill);
          });

          section.appendChild(pillsRow);
        }

        container.appendChild(section);
      });
    } catch (e) {
      console.warn('renderConnectInputPills failed', e);
    }
  }

  window.collectUpstreamConnectNodesForTargets = collectUpstreamConnectNodesForTargets;
  window.renderConnectInputPills = renderConnectInputPills;
})();

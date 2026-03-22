const http = require('http');

// Mix of record-level and field-level events
const events = [
  // Record-level event
  {
    event: 'delivery:created',
    module: 'delivery',
    action: 'created',
    eventType: 'record',
    payload: {
      id: 101,
      tracking_number: 'AWB2024001',
      status: 'pending',
      customer: 'John Doe',
      amount: 150
    }
  },
  // Field-level event: status changed
  {
    event: 'delivery:fieldEvent:status_updated',
    module: 'delivery',
    action: 'status_updated',
    eventType: 'field',
    level: 'technical',
    payload: {
      field: 'status',
      prev: 'pending',
      value: 'in_transit'
    }
  },
  // Record-level event
  {
    event: 'delivery:updated',
    module: 'delivery',
    action: 'updated',
    eventType: 'record',
    payload: {
      id: 101,
      tracking_number: 'AWB2024001',
      status: 'in_transit',
      location: 'New York',
      eta: '2026-03-22T14:30:00Z'
    }
  },
  // Field-level event: location changed
  {
    event: 'delivery:fieldEvent:location_updated',
    module: 'delivery',
    action: 'location_updated',
    eventType: 'field',
    level: 'technical',
    payload: {
      field: 'location',
      prev: null,
      value: 'New York'
    }
  },
  // Record-level event
  {
    event: 'delivery:completed',
    module: 'delivery',
    action: 'completed',
    eventType: 'record',
    payload: {
      id: 101,
      tracking_number: 'AWB2024001',
      status: 'delivered',
      delivered_at: new Date().toISOString(),
      signature: 'John Doe'
    }
  }
];

async function sendEvent(event) {
  return new Promise((resolve) => {
    const data = JSON.stringify(event);
    const options = {
      hostname: 'localhost',
      port: 5050,
      path: '/api/orchestrator/event',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length
      }
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        try {
          resolve(JSON.parse(body));
        } catch (e) {
          resolve({ ok: false, error: 'parse_error' });
        }
      });
    });

    req.on('error', () => {
      resolve({ ok: false, error: 'connection_failed' });
    });

    req.write(data);
    req.end();
  });
}

async function run() {
  console.log('🚀 Sending mixed record-level and field-level events...\n');

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    const typeLabel = event.eventType === 'field' ? '🔧 FIELD' : '📦 RECORD';
    console.log(`[${i + 1}/${events.length}] ${typeLabel}: ${event.event}`);
    console.log(`  Payload:`, JSON.stringify(event.payload, null, 2));

    const res = await sendEvent(event);
    console.log(`  Response: ${res.ok ? '✅ Accepted' : '❌ Failed'} (ID: ${res.id || 'N/A'})`);
    console.log();

    // Wait between events so they're visible in the dashboard
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('✅ All events sent! Check the live dashboard for segregated events.\n');
  console.log('Expected dashboard view:');
  console.log('  📦 RECORD EVENTS (3) - with full payload JSON');
  console.log('  🔧 FIELD CHANGES (2) - with field name and before/after values\n');
}

run().catch(console.error);

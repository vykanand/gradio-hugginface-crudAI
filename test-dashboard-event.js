const http = require('http');

// Send multiple test events with proper payload structure
const events = [
  {
    event: 'delivery:created',
    module: 'delivery',
    payload: {
      id: 101,
      tracking_number: 'AWB2024001',
      status: 'pending',
      customer: 'John Doe',
      amount: 150.00
    }
  },
  {
    event: 'delivery:updated',
    module: 'delivery',
    payload: {
      id: 101,
      tracking_number: 'AWB2024001',
      status: 'in_transit',
      location: 'New York',
      eta: '2026-03-22T14:30:00Z'
    }
  },
  {
    event: 'delivery:completed',
    module: 'delivery',
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
  console.log('🚀 Sending test events to orchestrator...\n');

  for (let i = 0; i < events.length; i++) {
    const event = events[i];
    console.log(`[${i + 1}/${events.length}] Sending: ${event.event}`);
    console.log(`  Payload:`, JSON.stringify(event.payload, null, 2));

    const res = await sendEvent(event);
    console.log(`  Response: ${res.ok ? '✅ Accepted' : '❌ Failed'} (ID: ${res.id || 'N/A'})`);
    console.log();

    // Wait between events so they're visible in the dashboard
    await new Promise(r => setTimeout(r, 800));
  }

  console.log('✅ All events sent! Check the live dashboard for events.\n');
}

run().catch(console.error);

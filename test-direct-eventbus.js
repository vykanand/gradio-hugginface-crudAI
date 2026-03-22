#!/usr/bin/env node

const eventBus = require('./services/eventBus');

async function test() {
  console.log('Initializing eventBus...');
  await eventBus.init();

  console.log('Publishing event...');
  const result = await eventBus.publishEvent({
    event: 'delivery:test:edited',
    module: 'delivery',
    detail: { value: 'test123' }
  }, {});

  console.log('Publish result:', result);

  console.log('Listing events...');
  const records = await eventBus.listAllEventRecords();
  console.log('Records:', records);

  process.exit(0);
}

test().catch(e => {
  console.error('Test failed:', e);
  process.exit(1);
});

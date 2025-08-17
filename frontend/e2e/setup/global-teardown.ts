import { FullConfig } from '@playwright/test';

async function globalTeardown(config: FullConfig) {
  console.log('Running E2E test teardown...');
  
  delete process.env['E2E_TEST'];
  delete process.env['MOCK_AUTH'];
  
  console.log('Global teardown complete');
}

export default globalTeardown;
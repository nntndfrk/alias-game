import { FullConfig } from '@playwright/test';

async function globalSetup(config: FullConfig) {
  console.log('Starting E2E test setup...');
  
  process.env['E2E_TEST'] = 'true';
  process.env['MOCK_AUTH'] = 'true';
  
  console.log('Waiting for services to be ready...');
  await new Promise(resolve => setTimeout(resolve, 3000));
  
  console.log('Global setup complete');
}

export default globalSetup;
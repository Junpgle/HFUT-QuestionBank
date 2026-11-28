import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir:'./tests',testMatch:'smart-learning.spec.mjs',workers:1,timeout:30000,
  use:{browserName:'chromium',headless:true,trace:'retain-on-failure',screenshot:'only-on-failure'},
  webServer:{command:'npm run dev -- --host 127.0.0.1 --port 4175 --strictPort',url:'http://127.0.0.1:4175/tests/smart-learning.html',reuseExistingServer:false,timeout:60000}
});

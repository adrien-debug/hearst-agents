import { test } from '@playwright/test';

test('Floating Stage Light full page screenshot', async ({ page }) => {
  // Attend que le serveur soit prêt
  await page.goto('http://localhost:9000', { waitUntil: 'domcontentloaded' });
  
  // Attendre un peu pour que les styles se chargent
  await page.waitForTimeout(2500);
  
  // Prendre une capture full page
  await page.screenshot({ path: '/tmp/floating-stage-full.png', fullPage: true });
  
  console.log('Screenshot pris : /tmp/floating-stage-full.png');
});

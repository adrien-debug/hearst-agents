import { test, expect } from '@playwright/test';

test('Floating Stage Light screenshot', async ({ page }) => {
  // Attend que le serveur soit prêt
  await page.goto('http://localhost:9000', { waitUntil: 'domcontentloaded' });
  
  // Attendre un peu pour que les styles se chargent
  await page.waitForTimeout(2000);
  
  // Prendre une capture
  await page.screenshot({ path: '/tmp/floating-stage-light.png', fullPage: false });
  
  // Vérifie que le Stage a un fond blanc
  const stage = page.locator('div[class*="flex-1"][class*="relative"][class*="mx-3"][class*="rounded-2xl"]').first();
  const computedStyle = await stage.evaluate(el => window.getComputedStyle(el).backgroundColor);
  
  console.log('Background color:', computedStyle);
  expect(computedStyle).toContain('255'); // Devrait être blanc (RGB 255, 255, 255)
});

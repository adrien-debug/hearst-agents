import { test, expect } from '@playwright/test';

test('Inspect Stage container properties', async ({ page }) => {
  await page.goto('http://localhost:9000', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  
  // Sélectionne le Stage container
  const stage = page.locator('div[class*="flex-1"][class*="relative"][class*="mx-3"][class*="rounded-2xl"]').first();
  
  // Récupère les styles appliqués
  const bgColor = await stage.evaluate(el => window.getComputedStyle(el).backgroundColor);
  const borderRadius = await stage.evaluate(el => window.getComputedStyle(el).borderRadius);
  const classes = await stage.evaluate(el => el.className);
  const inlineStyle = await stage.evaluate(el => el.getAttribute('style'));
  
  console.log('=== STAGE CONTAINER ===');
  console.log('Background Color:', bgColor);
  console.log('Border Radius:', borderRadius);
  console.log('Classes:', classes);
  console.log('Inline Style:', inlineStyle);
  
  // Vérifie le <main> enfant
  const main = page.locator('main').first();
  const mainBg = await main.evaluate(el => window.getComputedStyle(el).backgroundColor);
  const mainColor = await main.evaluate(el => window.getComputedStyle(el).color);
  
  console.log('=== MAIN ELEMENT ===');
  console.log('Main Background:', mainBg);
  console.log('Main Text Color:', mainColor);
  
  // Vérifie les variables CSS du Stage
  const cssVars = await stage.evaluate(el => {
    const style = window.getComputedStyle(el);
    return {
      bgLightStage: style.getPropertyValue('--bg-light-stage'),
      textDarkStrong: style.getPropertyValue('--text-dark-strong'),
    };
  });
  
  console.log('=== CSS VARIABLES ===');
  console.log('CSS Vars:', cssVars);
});

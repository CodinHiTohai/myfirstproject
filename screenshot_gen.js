/**
 * screenshot.js — Takes screenshots of all Eye In pages
 * Run from: c:\govindproject => node screenshot_gen.js
 */
const puppeteer = require('puppeteer');
const path = require('path');
const fs = require('fs');

const BASE = 'http://localhost:3000';
const OUT  = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

const PAGES = [
  { name: '01_home',             url: '/',                       wait: 2500 },
  { name: '02_results',          url: '/results.html',           wait: 2500 },
  { name: '03_driver_login',     url: '/driver-login.html',      wait: 1500 },
  { name: '04_driver_register',  url: '/driver-register.html',   wait: 1500 },
  { name: '05_forgot_password',  url: '/forgot-password.html',   wait: 1500 },
  { name: '06_admin_login',      url: '/admin-login.html',       wait: 1500 },
  { name: '07_admin_dashboard',  url: '/admin-dashboard.html',   wait: 2500 },
  { name: '08_driver_dashboard', url: '/driver-dashboard.html',  wait: 2500 },
];

async function run() {
  console.log('🚀 Launching Chromium browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  page.on('requestfailed', () => {});
  page.on('pageerror', () => {});

  for (const p of PAGES) {
    try {
      console.log(`📸 Capturing: ${p.name}`);
      await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, p.wait));

      const file = path.join(OUT, `${p.name}.png`);
      await page.screenshot({ path: file, fullPage: true });
      const size = Math.round(fs.statSync(file).size / 1024);
      console.log(`   ✅ Saved (${size} KB): ${p.name}.png`);

      // Extra seat-selection scroll view for results page
      if (p.name === '02_results') {
        await page.evaluate(() => window.scrollTo(0, 700));
        await new Promise(r => setTimeout(r, 800));
        const file2 = path.join(OUT, '02b_seat_selection.png');
        await page.screenshot({ path: file2, fullPage: false });
        console.log(`   ✅ Saved seat view: 02b_seat_selection.png`);
      }

    } catch (err) {
      console.warn(`   ⚠️  Failed ${p.name}: ${err.message}`);
    }
  }

  await browser.close();
  const files = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`\n✅ Done! ${files.length} screenshots saved to:\n   ${OUT}`);
  console.log('FILES:', files.join(', '));
}

run().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

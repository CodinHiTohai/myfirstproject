/**
 * capture_all.js — Starts server + takes screenshots of all Eye In pages
 * Run: node capture_all.js
 */
const puppeteer  = require('puppeteer');
const { spawn }  = require('child_process');
const path       = require('path');
const fs         = require('fs');
const http       = require('http');

const BASE = 'http://localhost:3000';
const OUT  = path.join(__dirname, 'screenshots');
if (!fs.existsSync(OUT)) fs.mkdirSync(OUT, { recursive: true });

// ── Pages to capture ──────────────────────────────────────────────
const PAGES = [
  { name: '01_home',             url: '/',                       full: true,  wait: 3000, label: 'Home Page – Bus Search' },
  { name: '02_results',          url: '/results.html',           full: true,  wait: 3000, label: 'Results & Route List' },
  { name: '03_seat_selection',   url: '/results.html',           full: false, wait: 3000, label: 'Seat Selection View', scrollY: 600 },
  { name: '04_driver_login',     url: '/driver-login.html',      full: true,  wait: 1500, label: 'Driver Login' },
  { name: '05_driver_register',  url: '/driver-register.html',   full: true,  wait: 1500, label: 'Driver Registration' },
  { name: '06_forgot_password',  url: '/forgot-password.html',   full: true,  wait: 1500, label: 'Forgot Password (New Design)' },
  { name: '07_admin_login',      url: '/admin-login.html',       full: true,  wait: 1500, label: 'Admin Login' },
  { name: '08_admin_dashboard',  url: '/admin-dashboard.html',   full: true,  wait: 3000, label: 'Admin Dashboard' },
  { name: '09_driver_dashboard', url: '/driver-dashboard.html',  full: true,  wait: 3000, label: 'Driver Dashboard' },
];

// ── Wait for server to be ready ───────────────────────────────────
function waitForServer(url, timeout = 20000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const check = () => {
      http.get(url, res => {
        resolve();
      }).on('error', () => {
        if (Date.now() - start > timeout) return reject(new Error('Server timeout'));
        setTimeout(check, 500);
      });
    };
    check();
  });
}

async function main() {
  // ── Start server ─────────────────────────────────────────────────
  console.log('🚀 Starting Eye In server...');
  const srv = spawn('node', ['server.js'], {
    cwd: __dirname,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  srv.stdout.on('data', d => process.stdout.write('  [server] ' + d));
  srv.stderr.on('data', d => {});

  // Wait for server to be ready
  try {
    await waitForServer(BASE + '/', 20000);
    console.log('✅ Server is up!\n');
  } catch (e) {
    console.error('❌ Server did not start in time'); srv.kill(); process.exit(1);
  }

  // ── Launch browser ────────────────────────────────────────────────
  console.log('🌐 Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox','--disable-setuid-sandbox','--disable-gpu','--disable-dev-shm-usage'],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();
  page.on('requestfailed', () => {});
  page.on('pageerror',     () => {});

  console.log('');

  for (const p of PAGES) {
    try {
      console.log(`📸  [${p.name}]  ${p.label}`);
      await page.goto(BASE + p.url, { waitUntil: 'domcontentloaded', timeout: 15000 });
      await new Promise(r => setTimeout(r, p.wait));

      if (p.scrollY) {
        await page.evaluate(y => window.scrollTo(0, y), p.scrollY);
        await new Promise(r => setTimeout(r, 800));
      }

      const file = path.join(OUT, `${p.name}.png`);
      await page.screenshot({ path: file, fullPage: p.full });
      const kb = Math.round(fs.statSync(file).size / 1024);
      console.log(`     ✅  Saved  (${kb} KB)  →  ${p.name}.png`);

    } catch (err) {
      console.warn(`     ⚠️  FAILED: ${err.message}`);
    }
  }

  await browser.close();
  srv.kill();

  // ── Summary ───────────────────────────────────────────────────────
  const saved = fs.readdirSync(OUT).filter(f => f.endsWith('.png'));
  console.log(`\n🎉  Done!  ${saved.length} / ${PAGES.length} screenshots saved`);
  console.log(`📁  Folder:  ${OUT}`);
  console.log(`📂  Files :  ${saved.join(', ')}`);
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });

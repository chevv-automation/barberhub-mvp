const { chromium } = require('playwright');
const http = require('http');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const PORT = 8089;

const VIEWPORTS = [
  { name: 'Desktop 1920x1080', width: 1920, height: 1080 },
  { name: 'Desktop 1440x900', width: 1440, height: 900 },
  { name: 'Laptop 1366x768', width: 1366, height: 768 },
  { name: 'Tablet Landscape 1024x768', width: 1024, height: 768 },
  { name: 'Tablet Portrait 768x1024', width: 768, height: 1024 },
  { name: 'Mobile 390x844', width: 390, height: 844 },
  { name: 'Small Mobile 360x800', width: 360, height: 800 }
];

const PAGES = [
  'login.html',
  'dashboard.html',
  'cashier.html',
  'management.html',
  'history.html',
  'settings.html'
];

function startStaticServer() {
  const mimeTypes = {
    '.html': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
  };

  const server = http.createServer((req, res) => {
    let reqPath = req.url.split('?')[0].split('#')[0];
    if (reqPath === '/') reqPath = '/dashboard.html';
    const filePath = path.join(ROOT_DIR, reqPath);

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('404 Not Found');
        return;
      }
      const ext = path.extname(filePath).toLowerCase();
      res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(PORT, '127.0.0.1', () => resolve(server));
  });
}

async function runAll() {
  const server = await startStaticServer();
  console.log(`Local test server running at http://127.0.0.1:${PORT}`);

  const browser = await chromium.launch({ headless: true });
  let allPassed = true;

  try {
    // ==============================================================
    // SUITE 1: RESPONSIVE OVERFLOW & DRAWER VERIFICATION
    // ==============================================================
    console.log('\n==============================================');
    console.log('SUITE 1: 7 VIEWPORTS x 6 PAGES OVERFLOW TESTS');
    console.log('==============================================');

    for (const pageName of PAGES) {
      console.log(`\n--- Page: ${pageName} ---`);
      for (const vp of VIEWPORTS) {
        const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
        await page.goto(`http://127.0.0.1:${PORT}/${pageName}`, { waitUntil: 'load' });
        await page.waitForTimeout(60);

        const overflow = await page.evaluate(() => {
          const docW = document.documentElement.scrollWidth;
          const winW = window.innerWidth;
          const bodyW = document.body.scrollWidth;
          return {
            hasOverflow: (docW > winW + 1) || (bodyW > winW + 1),
            docW, winW
          };
        });

        const passed = !overflow.hasOverflow;
        if (!passed) allPassed = false;
        console.log(`  [${vp.name}] No Overflow: ${passed ? 'PASS' : 'FAIL'} (doc: ${overflow.docW}px, win: ${overflow.winW}px)`);

        // Test Drawer on mobile / tablet
        if (vp.width < 1024 && pageName !== 'login.html') {
          const menuBtn = await page.$('#mobile-menu-btn');
          if (menuBtn && await menuBtn.isVisible()) {
            await menuBtn.click();
            await page.waitForTimeout(250);
            const drawerOpen = await page.evaluate(() => {
              const aside = document.querySelector('aside');
              const bd = document.getElementById('sidebar-backdrop');
              return aside && aside.classList.contains('translate-x-0') && bd && !bd.classList.contains('hidden');
            });

            const closeBtn = await page.$('#sidebar-close-btn');
            if (closeBtn) {
              await page.evaluate(() => document.getElementById('sidebar-close-btn').click());
              await page.waitForTimeout(250);
            }
            const drawerClosed = await page.evaluate(() => {
              const aside = document.querySelector('aside');
              return aside && aside.classList.contains('-translate-x-full');
            });

            if (!drawerOpen || !drawerClosed) {
              console.log(`    -> Drawer Check FAIL: open=${drawerOpen}, closed=${drawerClosed}`);
              allPassed = false;
            }
          }
        }

        await page.close();
      }
    }

    // ==============================================================
    // SUITE 2: PERSISTENT SHELL ROUTER & ZERO-FLICKER TRANSITIONS
    // ==============================================================
    console.log('\n==============================================');
    console.log('SUITE 2: PERSISTENT SHELL ROUTER VERIFICATION');
    console.log('==============================================');

    {
      const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
      await page.goto(`http://127.0.0.1:${PORT}/dashboard.html`, { waitUntil: 'load' });
      await page.waitForTimeout(100);

      // Attach a persistent probe property to window to prove window never reloads!
      await page.evaluate(() => {
        window.__SHELL_PROBE = 999;
        const aside = document.getElementById('sidebar-nav');
        if (aside) aside.__PERSISTENT_MOUNTED = true;
      });

      console.log('  1. Initial Page: Dashboard loaded.');
      let probe = await page.evaluate(() => window.__SHELL_PROBE);
      let asidePersistent = await page.evaluate(() => {
        const aside = document.getElementById('sidebar-nav');
        return aside && aside.__PERSISTENT_MOUNTED === true;
      });
      console.log(`     Shell probe: ${probe === 999 ? 'ACTIVE' : 'FAIL'}, Aside persistent marker: ${asidePersistent}`);

      // Navigate: Dashboard -> Transaksi (cashier.html)
      console.log('  2. Navigating to Transaksi via Sidebar link...');
      await page.click('aside a[href="cashier.html"]');
      await page.waitForTimeout(250);

      // Check that window NEVER reloaded and aside is the EXACT same DOM node
      probe = await page.evaluate(() => window.__SHELL_PROBE);
      asidePersistent = await page.evaluate(() => {
        const aside = document.getElementById('sidebar-nav');
        return aside && aside.__PERSISTENT_MOUNTED === true;
      });
      const breadcrumbTx = await page.$eval('#breadcrumb-page-name', el => el.textContent.trim());
      const isCashierActive = await page.evaluate(() => {
        const a = document.querySelector('aside a[href="cashier.html"]');
        return a && a.getAttribute('aria-current') === 'page';
      });

      console.log(`     Zero-reload verified (Probe=${probe === 999 ? 'PRESERVED' : 'LOST'}, Aside=${asidePersistent ? 'STABLE' : 'UNMOUNTED'})`);
      console.log(`     Breadcrumb: "${breadcrumbTx}", Active Nav: ${isCashierActive ? 'PASS' : 'FAIL'}`);
      if (probe !== 999 || !asidePersistent || breadcrumbTx !== 'Transaksi' || !isCashierActive) allPassed = false;

      // Verify cashier interactivity in SPA router mode
      console.log('  3. Testing Cashier interactivity after router navigation...');
      await page.evaluate(() => addToCart('s1', 'Layanan'));
      await page.evaluate(() => addToCart('p1', 'Produk'));
      await page.waitForTimeout(80);
      const cashierSubtotal = await page.$eval('#summary-subtotal', el => el.textContent.trim());
      console.log(`     Cart added items after SPA nav: Subtotal = ${cashierSubtotal}`);
      if (cashierSubtotal !== 'Rp100.000') allPassed = false;

      // Navigate: Transaksi -> Manajemen (management.html)
      console.log('  4. Navigating to Manajemen via Sidebar link...');
      await page.click('aside a[href="management.html"]');
      await page.waitForTimeout(250);

      probe = await page.evaluate(() => window.__SHELL_PROBE);
      const breadcrumbMgmt = await page.$eval('#breadcrumb-page-name', el => el.textContent.trim());
      console.log(`     Zero-reload verified (Probe=${probe === 999 ? 'PRESERVED' : 'LOST'}), Breadcrumb: "${breadcrumbMgmt}"`);
      if (probe !== 999 || breadcrumbMgmt !== 'Manajemen') allPassed = false;

      // Test management tab switching
      await page.evaluate(() => switchTab('layanan'));
      await page.waitForTimeout(80);
      const layananVisible = await page.evaluate(() => {
        const sec = document.getElementById('content-layanan');
        return sec && !sec.classList.contains('hidden');
      });
      console.log(`     Management Tab Switching after router: Layanan Tab Visible = ${layananVisible}`);
      if (!layananVisible) allPassed = false;

      // Navigate: Manajemen -> Riwayat (history.html)
      console.log('  5. Navigating to Riwayat via Sidebar link...');
      await page.click('aside a[href="history.html"]');
      await page.waitForTimeout(250);

      probe = await page.evaluate(() => window.__SHELL_PROBE);
      const breadcrumbHist = await page.$eval('#breadcrumb-page-name', el => el.textContent.trim());
      console.log(`     Zero-reload verified (Probe=${probe === 999 ? 'PRESERVED' : 'LOST'}), Breadcrumb: "${breadcrumbHist}"`);
      if (probe !== 999 || breadcrumbHist !== 'Riwayat') allPassed = false;

      // Navigate: Riwayat -> Pengaturan (settings.html)
      console.log('  6. Navigating to Pengaturan via Sidebar link...');
      await page.click('aside a[href="settings.html"]');
      await page.waitForTimeout(250);

      probe = await page.evaluate(() => window.__SHELL_PROBE);
      const breadcrumbSettings = await page.$eval('#breadcrumb-page-name', el => el.textContent.trim());
      console.log(`     Zero-reload verified (Probe=${probe === 999 ? 'PRESERVED' : 'LOST'}), Breadcrumb: "${breadcrumbSettings}"`);
      if (probe !== 999 || breadcrumbSettings !== 'Pengaturan') allPassed = false;

      // Test Browser History Back button
      console.log('  7. Testing Browser Back button (popstate)...');
      await page.goBack();
      await page.waitForTimeout(250);
      const backBreadcrumb = await page.$eval('#breadcrumb-page-name', el => el.textContent.trim());
      probe = await page.evaluate(() => window.__SHELL_PROBE);
      console.log(`     Returned to: "${backBreadcrumb}" (Probe=${probe === 999 ? 'PRESERVED' : 'LOST'})`);
      if (probe !== 999 || backBreadcrumb !== 'Riwayat') allPassed = false;

      // Test Browser History Forward button
      console.log('  8. Testing Browser Forward button (popstate)...');
      await page.goForward();
      await page.waitForTimeout(250);
      const fwdBreadcrumb = await page.$eval('#breadcrumb-page-name', el => el.textContent.trim());
      probe = await page.evaluate(() => window.__SHELL_PROBE);
      console.log(`     Forwarded to: "${fwdBreadcrumb}" (Probe=${probe === 999 ? 'PRESERVED' : 'LOST'})`);
      if (probe !== 999 || fwdBreadcrumb !== 'Pengaturan') allPassed = false;

      // Navigate back to Dashboard
      console.log('  9. Navigating back to Dashboard...');
      await page.click('aside a[href="dashboard.html"]');
      await page.waitForTimeout(250);
      const finalBreadcrumb = await page.$eval('#breadcrumb-page-name', el => el.textContent.trim());
      probe = await page.evaluate(() => window.__SHELL_PROBE);
      console.log(`     Back to: "${finalBreadcrumb}" (Probe=${probe === 999 ? 'PRESERVED' : 'LOST'})`);
      if (probe !== 999 || finalBreadcrumb !== 'Dashboard') allPassed = false;

      // Logout check (should trigger full page load to login.html)
      console.log('  10. Testing Logout link...');
      await page.click('aside a[href="login.html"]');
      await page.waitForTimeout(200);
      const curUrl = page.url();
      console.log(`     Logout reached: ${curUrl}`);
      if (!curUrl.includes('login.html')) allPassed = false;

      await page.close();
    }

    // ==============================================================
    // SUITE 3: COMPLETE CASHIER BUSINESS LOGIC & DISCOUNT FLOW
    // ==============================================================
    console.log('\n==============================================');
    console.log('SUITE 3: CASHIER COMPLETE TRANSACTION DEEP DIVE');
    console.log('==============================================');

    {
      const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
      await page.goto(`http://127.0.0.1:${PORT}/cashier.html`, { waitUntil: 'load' });
      await page.waitForTimeout(100);

      // Add s1 (35.000) and p1 (65.000)
      await page.evaluate(() => {
        addToCart('s1', 'Layanan');
        addToCart('p1', 'Produk');
      });
      await page.waitForTimeout(60);

      // Switch to cart on mobile
      await page.evaluate(() => switchMobileView('cart'));
      await page.waitForTimeout(60);

      // Test Nominal Discount
      await page.click('#discount-toggle-checkbox');
      await page.fill('#discount-input', '20000');
      await page.dispatchEvent('#discount-input', 'input');
      await page.waitForTimeout(60);

      let subtotal = await page.$eval('#summary-subtotal', el => el.textContent.trim());
      let discount = await page.$eval('#summary-discount', el => el.textContent.trim());
      let total = await page.$eval('#summary-total', el => el.textContent.trim());
      console.log(`  Nominal Discount (-20k) -> Subtotal: ${subtotal}, Discount: ${discount}, Total: ${total}`);
      if (subtotal !== 'Rp100.000' || discount !== '-Rp20.000' || total !== 'Rp80.000') allPassed = false;

      // Test Percentage Discount
      await page.click('#discount-type-percent');
      await page.fill('#discount-input', '10');
      await page.dispatchEvent('#discount-input', 'input');
      await page.waitForTimeout(60);

      discount = await page.$eval('#summary-discount', el => el.textContent.trim());
      total = await page.$eval('#summary-total', el => el.textContent.trim());
      console.log(`  Percentage Discount (10%) -> Discount: ${discount}, Total: ${total}`);
      if (discount !== '-Rp10.000' || total !== 'Rp90.000') allPassed = false;

      // Capster validation test: Try checkout without capster
      await page.selectOption('#capster-select', '');
      await page.click('#btn-checkout');
      await page.waitForTimeout(60);

      let modalVisible = await page.evaluate(() => {
        const m = document.getElementById('payment-modal');
        return m && !m.classList.contains('hidden');
      });
      let capsterErrVisible = await page.evaluate(() => {
        const err = document.getElementById('capster-validation-msg');
        return err && !err.classList.contains('hidden');
      });
      console.log(`  Validation without Capster -> Blocked: ${!modalVisible}, Error Shown: ${capsterErrVisible}`);
      if (modalVisible || !capsterErrVisible) allPassed = false;

      // Select Capster and proceed
      await page.selectOption('#capster-select', 'Budi');
      await page.click('#btn-checkout');
      await page.waitForTimeout(100);

      modalVisible = await page.evaluate(() => {
        const m = document.getElementById('payment-modal');
        return m && !m.classList.contains('hidden');
      });
      console.log(`  Proceed with Capster Budi -> Payment Modal Open: ${modalVisible}`);
      if (!modalVisible) allPassed = false;

      // Test Cash Validation: Enter insufficient cash
      await page.fill('#cash-received-input', '50000');
      await page.dispatchEvent('#cash-received-input', 'input');
      await page.click('#btn-confirm-transaction');
      await page.waitForTimeout(60);

      let succModalVisible = await page.evaluate(() => {
        const m = document.getElementById('success-modal');
        return m && !m.classList.contains('hidden');
      });
      let cashErrVisible = await page.evaluate(() => {
        const err = document.getElementById('cash-validation-msg');
        return err && !err.classList.contains('hidden');
      });
      console.log(`  Insufficient Cash (50k < 90k) -> Blocked: ${!succModalVisible}, Error Shown: ${cashErrVisible}`);
      if (succModalVisible || !cashErrVisible) allPassed = false;

      // Enter sufficient cash: 100.000
      await page.fill('#cash-received-input', '100000');
      await page.dispatchEvent('#cash-received-input', 'input');
      const changeText = await page.$eval('#cash-change-display', el => el.textContent.trim());
      console.log(`  Sufficient Cash (100k) -> Calculated Change: ${changeText} (Expected: Rp10.000)`);
      if (changeText !== 'Rp10.000') allPassed = false;

      // Confirm Payment
      await page.click('#btn-confirm-transaction');
      await page.waitForTimeout(100);

      succModalVisible = await page.evaluate(() => {
        const m = document.getElementById('success-modal');
        return m && !m.classList.contains('hidden');
      });
      const receiptTotal = await page.$eval('#succ-total', el => el.textContent.trim());
      console.log(`  Payment Confirmed -> Success Modal Visible: ${succModalVisible}, Receipt Total: ${receiptTotal}`);
      if (!succModalVisible || receiptTotal !== 'Rp90.000') allPassed = false;

      // Reset POS for new order
      await page.click('#btn-new-order');
      await page.waitForTimeout(100);

      const resetState = await page.evaluate(() => {
        const sModal = document.getElementById('success-modal');
        const pModal = document.getElementById('payment-modal');
        const catSec = document.getElementById('section-catalog');
        return {
          modalsClosed: sModal.classList.contains('hidden') && pModal.classList.contains('hidden'),
          catalogVisible: !catSec.classList.contains('hidden')
        };
      });
      console.log(`  Reset -> Modals Closed: ${resetState.modalsClosed}, Catalog View Active: ${resetState.catalogVisible}`);
      if (!resetState.modalsClosed || !resetState.catalogVisible) allPassed = false;

      await page.close();
    }

  } finally {
    await browser.close();
    server.close();
  }

  console.log('\n==============================================');
  console.log(`FINAL RESULT: ${allPassed ? 'ALL VERIFICATIONS PASSED SUCCESSFULLY' : 'SOME VERIFICATIONS FAILED'}`);
  console.log('==============================================\n');

  if (!allPassed) process.exit(1);
}

runAll().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});

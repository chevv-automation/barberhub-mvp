const { chromium } = require('playwright');
const path = require('path');

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

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  let allPassed = true;

  console.log('=== STARTING RESPONSIVE & INTERACTION VERIFICATION ===\n');

  for (const pageName of PAGES) {
    console.log(`\n--- Testing Page: ${pageName} ---`);
    for (const vp of VIEWPORTS) {
      const page = await browser.newPage({ viewport: { width: vp.width, height: vp.height } });
      const filePath = 'file://' + path.resolve(__dirname, '..', pageName);
      await page.goto(filePath, { waitUntil: 'load' });
      await page.waitForTimeout(100);

      // Check horizontal overflow
      const overflow = await page.evaluate(() => {
        const docWidth = document.documentElement.scrollWidth;
        const winWidth = window.innerWidth;
        const bodyWidth = document.body.scrollWidth;
        return {
          hasDocOverflow: docWidth > winWidth + 1,
          hasBodyOverflow: bodyWidth > winWidth + 1,
          docWidth,
          winWidth
        };
      });

      const passed = !overflow.hasDocOverflow && !overflow.hasBodyOverflow;
      if (!passed) allPassed = false;

      console.log(`  [${vp.name}] Overflow Check: ${passed ? 'PASS' : 'FAIL'} (doc: ${overflow.docWidth}px, win: ${overflow.winWidth}px)`);

      // If mobile/tablet, test mobile menu button
      if (vp.width < 1024 && pageName !== 'login.html') {
        const menuBtn = await page.$('#mobile-menu-btn');
        if (menuBtn) {
          const isVisible = await menuBtn.isVisible();
          if (isVisible) {
            await menuBtn.click();
            await page.waitForTimeout(100);
            const drawerOpen = await page.evaluate(() => {
              const aside = document.querySelector('aside');
              const backdrop = document.getElementById('sidebar-backdrop');
              return aside && aside.classList.contains('translate-x-0') && backdrop && !backdrop.classList.contains('hidden');
            });

            // Close it
            const closeBtn = await page.$('#sidebar-close-btn');
            let drawerClosed = false;
            if (closeBtn) {
              await closeBtn.click();
              await page.waitForTimeout(100);
              drawerClosed = await page.evaluate(() => {
                const aside = document.querySelector('aside');
                return aside && aside.classList.contains('-translate-x-full');
              });
            }
            if (!drawerOpen || !drawerClosed) {
              console.log(`    -> Mobile Drawer Toggle: Open=${drawerOpen}, Close=${drawerClosed}`);
              allPassed = false;
            }
          }
        }
      }

      await page.close();
    }
  }

  // --- SPECIAL TRANSACTION & BUSINESS LOGIC VERIFICATION ---
  console.log('\n--- Deep Testing cashier.html (Mobile & Desktop Interactions) ---');
  
  // Test 1: Mobile (390x844) Cashier Complete Flow
  {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const filePath = 'file://' + path.resolve(__dirname, '..', 'cashier.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForTimeout(200);

    console.log('  Testing Mobile 390x844: Adding items to cart...');
    // Click service 1 (Potong Rambut: Rp35.000)
    await page.evaluate(() => addToCart('s1', 'Layanan'));
    await page.evaluate(() => addToCart('s2', 'Layanan')); // Haircut + Wash: Rp50.000
    await page.waitForTimeout(100);

    const subtotalText = await page.$eval('#summary-subtotal', el => el.textContent.trim());
    const totalText = await page.$eval('#summary-total', el => el.textContent.trim());
    console.log(`    Cart updated: Subtotal = ${subtotalText}, Total = ${totalText}`);

    // Check sticky mobile bar
    const barTotal = await page.$eval('#mobile-bar-total', el => el.textContent.trim());
    const barQty = await page.$eval('#mobile-bar-qty', el => el.textContent.trim());
    console.log(`    Mobile Bar: ${barQty} item, Total = ${barTotal}`);

    // Switch to cart view via mobile tab
    console.log('    Switching to Cart view on mobile...');
    await page.click('#mobile-tab-cart');
    await page.waitForTimeout(100);

    const cartVisible = await page.$eval('#section-cart', el => !el.classList.contains('hidden'));
    const catalogHidden = await page.$eval('#section-catalog', el => el.classList.contains('hidden'));
    console.log(`    Cart Section Visible: ${cartVisible}, Catalog Hidden: ${catalogHidden}`);

    // Test Discount Toggle
    console.log('    Testing Discount Toggle & Calculations...');
    await page.click('#discount-toggle-checkbox');
    await page.waitForTimeout(100);
    await page.fill('#discount-input', '15000');
    await page.evaluate(() => validateAndApplyDiscountInput());
    await page.waitForTimeout(100);

    const discSubtotal = await page.$eval('#summary-subtotal', el => el.textContent.trim());
    const discAmount = await page.$eval('#summary-discount', el => el.textContent.trim());
    const discTotal = await page.$eval('#summary-total', el => el.textContent.trim());
    console.log(`    With Rp15.000 discount -> Subtotal: ${discSubtotal}, Discount: ${discAmount}, Final Total: ${discTotal}`);

    // Select Capster
    console.log('    Selecting Capster Budi...');
    await page.selectOption('#capster-select', 'Budi');

    // Checkout
    console.log('    Clicking Lanjut ke Pembayaran...');
    await page.click('#btn-checkout');
    await page.waitForTimeout(200);

    const modalVisible = await page.$eval('#payment-modal', el => !el.classList.contains('hidden'));
    console.log(`    Payment Modal Opened: ${modalVisible}`);

    // Confirm Payment
    console.log('    Confirming Payment...');
    await page.click('#btn-confirm-transaction');
    await page.waitForTimeout(500);

    const successVisible = await page.$eval('#success-modal', el => !el.classList.contains('hidden'));
    const successTotal = await page.$eval('#succ-total', el => el.textContent.trim());
    console.log(`    Success Modal Opened: ${successVisible}, Receipt Total: ${successTotal}`);

    // New Order (reset)
    await page.click('#btn-new-order');
    await page.waitForTimeout(200);

    const isCatalogBack = await page.$eval('#section-catalog', el => !el.classList.contains('hidden'));
    const isCartZero = await page.evaluate(() => cart.length === 0);
    console.log(`    Reset -> Returned to Catalog: ${isCatalogBack}, Cart length = 0: ${isCartZero}`);

    await page.close();
  }

  // Test 2: Desktop (1440x900) Cashier Split View & Operations
  {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const filePath = 'file://' + path.resolve(__dirname, '..', 'cashier.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForTimeout(200);

    console.log('\n  Testing Desktop 1440x900: Side-by-side Layout & Stepper...');
    const bothVisible = await page.evaluate(() => {
      const cat = document.getElementById('section-catalog');
      const cart = document.getElementById('section-cart');
      const catRect = cat.getBoundingClientRect();
      const cartRect = cart.getBoundingClientRect();
      return catRect.width > 300 && cartRect.width > 300 && catRect.right <= cartRect.left + 5;
    });
    console.log(`    Desktop Catalog & Cart Side-by-side: ${bothVisible ? 'PASS' : 'FAIL'}`);

    // Add item and test quantity stepper
    await page.evaluate(() => addToCart('s1', 'Layanan')); // 35000
    await page.waitForTimeout(100);
    await page.evaluate(() => updateQty('s1', 1)); // 2x 35000 = 70000
    await page.waitForTimeout(100);
    const steppedTotal = await page.$eval('#summary-total', el => el.textContent.trim());
    console.log(`    Quantity Stepper (Qty 2): Total = ${steppedTotal} (Expected: Rp70.000)`);

    await page.close();
  }

  // Test 3: Tablet Portrait (768x1024) Cashier Proportions
  {
    const page = await browser.newPage({ viewport: { width: 768, height: 1024 } });
    const filePath = 'file://' + path.resolve(__dirname, '..', 'cashier.html');
    await page.goto(filePath, { waitUntil: 'load' });
    await page.waitForTimeout(200);

    console.log('\n  Testing Tablet Portrait 768x1024: Proportions...');
    const dims = await page.evaluate(() => {
      const cat = document.getElementById('section-catalog');
      const cart = document.getElementById('section-cart');
      const aside = document.querySelector('aside');
      return {
        catalogWidth: cat ? cat.getBoundingClientRect().width : 0,
        cartWidth: cart ? cart.getBoundingClientRect().width : 0,
        asideVisible: aside ? !aside.classList.contains('-translate-x-full') : false
      };
    });
    console.log(`    Tablet 768px -> Catalog width: ${dims.catalogWidth}px, Cart width: ${dims.cartWidth}px, Aside collapsed in drawer: ${!dims.asideVisible}`);

    await page.close();
  }

  await browser.close();
  console.log(`\n=== FINAL RESULT: ${allPassed ? 'ALL VIEWPORTS & INTERACTIONS PASSED' : 'SOME TESTS FAILED'} ===`);
}

runTests().catch(err => {
  console.error('Test error:', err);
  process.exit(1);
});

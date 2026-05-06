const puppeteer = require('puppeteer');
const fetch = global.fetch || require('node-fetch');

async function clickCanvasAt(page, boardSelector, cellX, cellY, size=15) {
  const rect = await page.evaluate((sel) => {
    const c = document.querySelector(sel);
    const r = c.getBoundingClientRect();
    return {left: r.left, top: r.top, width: r.width, height: r.height};
  }, boardSelector);
  const cx = rect.left + (cellX + 0.5) * (rect.width / size);
  const cy = rect.top + (cellY + 0.5) * (rect.height / size);
  await page.mouse.click(cx, cy);
}

async function run() {
  const serverUrl = 'http://127.0.0.1:3000';
  console.log('Launching browsers...');
  const browser = await puppeteer.launch({headless: true, args: ['--no-sandbox']});
  const pageA = await browser.newPage();
  const pageB = await browser.newPage();

  await pageA.goto(serverUrl, {waitUntil:'networkidle2'});
  await pageB.goto(serverUrl, {waitUntil:'networkidle2'});

  // Create room in A
  await pageA.waitForSelector('#create');
  await pageA.click('#create');
  await pageA.waitForTimeout(500);
  const roomId = await pageA.$eval('#roomId', el => el.value);
  console.log('Room created:', roomId);

  // Join from B
  await pageB.type('#roomId', roomId);
  await pageB.click('#join');

  // Wait for state to be in-progress on both
  await pageA.waitForFunction(() => window.state && window.state.status === 'in-progress', {timeout:5000});
  await pageB.waitForFunction(() => window.state && window.state.status === 'in-progress', {timeout:5000});
  console.log('Both clients see game in-progress');

  // Make a move from A at (7,7)
  await clickCanvasAt(pageA, '#board', 7,7);
  await pageA.waitForTimeout(400);

  // Verify both clients saw the move
  const sa = await pageA.evaluate(() => window.state);
  const sb = await pageB.evaluate(() => window.state);
  if (!sa || !sb) throw new Error('state missing');
  if (sa.board[7][7] !== 'black') throw new Error('A did not register move');
  if (sb.board[7][7] !== 'black') throw new Error('B did not receive move');

  // Verify server state via debug endpoint
  const res = await fetch(`${serverUrl}/room/${roomId}`);
  const serverState = await res.json();
  if (serverState.board[7][7] !== 'black') throw new Error('Server did not record move');

  console.log('Smoke test passed — move synced to both clients and server');
  await browser.close();
}

run().catch(err => {
  console.error('Smoke test failed:', err);
  process.exit(2);
});

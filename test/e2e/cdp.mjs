// A Chrome DevTools Protocol client small enough to read: Node's own WebSocket, no dependencies.
// Enough of the protocol to open a page, run expressions in it, and answer the dialogs the editor
// puts up (confirm, and the browser's own "leave this page?").
import { spawn } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const CANDIDATES = [
  process.env.CHROME_PATH,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
];

export function findChrome() {
  return CANDIDATES.find((p) => p && existsSync(p)) ?? null;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Keys the page's own handlers look at the code of, not only the character
const KEYS = { Tab: 9, Enter: 13, Escape: 27 };

/** Start headless Chrome on a throwaway profile and wait for its debugging port. */
export async function launchChrome(port = 9333) {
  const binary = findChrome();
  if (!binary) throw new Error(`No Chrome found. Set CHROME_PATH, or install one of:\n  ${CANDIDATES.slice(1).join('\n  ')}`);
  const profile = mkdtempSync(join(tmpdir(), 'sgcms-e2e-'));
  const proc = spawn(
    binary,
    [
      '--headless=new',
      '--disable-gpu',
      '--no-first-run',
      '--no-default-browser-check',
      '--no-proxy-server',
      '--disable-dev-shm-usage',
      '--no-sandbox', // CI containers run as root, where the sandbox refuses to start
      `--remote-debugging-port=${port}`,
      `--user-data-dir=${profile}`,
      'about:blank',
    ],
    { stdio: 'ignore' },
  );
  for (let i = 0; i < 100; i++) {
    try {
      await fetch(`http://127.0.0.1:${port}/json/version`);
      return {
        port,
        close: async () => {
          proc.kill();
          await new Promise((r) => setTimeout(r, 300)); // it is still writing its profile
          rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
        },
      };
    } catch {
      await sleep(100);
    }
  }
  proc.kill();
  throw new Error('Chrome did not open its debugging port');
}

/** A page to drive. `dialogs` collects what the editor asked; `answer.value` is what it hears. */
export async function openPage(port) {
  const target = await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' }).then((r) => r.json());
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.onopen = resolve;
    ws.onerror = reject;
  });

  let id = 0;
  const waiting = new Map();
  const logs = [];
  const dialogs = [];
  const answer = { value: true };

  const send = (method, params = {}) =>
    new Promise((resolve, reject) => {
      const n = ++id;
      waiting.set(n, { resolve, reject });
      ws.send(JSON.stringify({ id: n, method, params }));
    });

  ws.onmessage = (e) => {
    const msg = JSON.parse(e.data);
    if (msg.id && waiting.has(msg.id)) {
      const { resolve, reject } = waiting.get(msg.id);
      waiting.delete(msg.id);
      return msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
    }
    if (msg.method === 'Runtime.exceptionThrown') logs.push(`[exception] ${msg.params.exceptionDetails.exception?.description ?? msg.params.exceptionDetails.text}`);
    if (msg.method === 'Runtime.consoleAPICalled' && msg.params.type === 'error') logs.push(`[console] ${msg.params.args.map((a) => a.value ?? a.description ?? a.type).join(' ')}`);
    // Network failures are logged too; they are named so a test can judge them separately
    if (msg.method === 'Log.entryAdded' && msg.params.entry.level === 'error') logs.push(`[${msg.params.entry.source}] ${msg.params.entry.text}`);
    // confirm() and the browser's unload warning both stop the page until something answers
    if (msg.method === 'Page.javascriptDialogOpening') {
      dialogs.push(msg.params.message);
      send('Page.handleJavaScriptDialog', { accept: answer.value }).catch(() => {});
    }
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Log.enable');

  const evaluate = async (expression) => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? `failed: ${expression}`);
    return r.result.value;
  };

  return {
    send,
    evaluate,
    logs,
    dialogs,
    answer,
    close: () => ws.close(),
    async navigate(url) {
      await send('Page.navigate', { url });
      await sleep(400);
    },
    /** Choose a file in a file input, as the file picker would. */
    async chooseFile(selector, file) {
      await send('DOM.enable');
      const { root } = await send('DOM.getDocument', { depth: -1 });
      const { nodeId } = await send('DOM.querySelector', { nodeId: root.nodeId, selector });
      if (!nodeId) throw new Error(`no file input at ${selector}`);
      await send('DOM.setFileInputFiles', { files: [file], nodeId });
    },
    /** Drag the mouse from one point to another, for the things only a drag can do. */
    async drag(from, to) {
      const mouse = { button: 'left', buttons: 1, clickCount: 1 };
      await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...from, ...mouse });
      for (const at of [0.5, 1]) {
        await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (to.x - from.x) * at, y: from.y + (to.y - from.y) * at, ...mouse });
      }
      await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...to, ...mouse });
      await sleep(120);
    },
    /** Press a key the way a person would, so the page's keymaps see it. */
    async press(key) {
      const vk = KEYS[key] ?? 0;
      for (const type of ['keyDown', 'keyUp']) await send('Input.dispatchKeyEvent', { type, key, code: key, windowsVirtualKeyCode: vk, nativeVirtualKeyCode: vk });
      await sleep(80);
    },
    /** Poll until the expression is truthy, so the tests don't depend on fixed waits. */
    async until(expression, { timeout = 10000, label = expression } = {}) {
      const deadline = Date.now() + timeout;
      for (;;) {
        if (await evaluate(`Boolean(${expression})`)) return;
        if (Date.now() > deadline) throw new Error(`timed out waiting for: ${label}`);
        await sleep(100);
      }
    },
  };
}

export { sleep };

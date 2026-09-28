// Measures what reopening the app costs in download, against the real relays.
// Seeds a family with a realistic amount of data, then "reopens" the phone
// (same saved data and cursors) and counts bytes received until sync settles.
import { createStore } from '../src/store.js';
import { createSync, DEFAULT_RELAYS } from '../src/sync.js';
import { deriveKeys } from '../src/keys.js';
import { generateCode } from '../src/codes.js';

function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v), removeItem: (k) => m.delete(k) };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// Count what each relay sends us and what we send it, per reopen.
const perRelay = new Map();
class CountingWS extends WebSocket {
  constructor(url) {
    super(url);
    const u = url.replace('wss://', '');
    if (!perRelay.has(u)) perRelay.set(u, { rx: 0, tx: 0, limited: 0 });
    this._c = perRelay.get(u);
    this.addEventListener('message', (m) => {
      const d = JSON.parse(m.data);
      if (d[0] === 'EVENT') this._c.rx++;
      if (d[0] === 'OK' && !d[2] && /rate/.test(d[3])) this._c.limited++;
    });
  }
  send(raw) { if (raw.startsWith('["EVENT"')) this._c.tx++; super.send(raw); }
}
async function settle(sync, ms = 6000) {
  // Wait until bytes stop arriving for a while.
  let last = -1;
  const start = Date.now();
  while (Date.now() - start < 30000) {
    await sleep(ms / 3);
    const n = sync.stats().recvBytes;
    if (n === last && sync.status().connected >= 3) return;
    last = n;
  }
}

const keys = await deriveKeys(generateCode());
const storage = memoryStorage();
const dataStorage = memoryStorage();
const store = createStore({ storageKey: 'data', storage: dataStorage });
let sync = createSync({ keys, store, storage, WebSocketImpl: CountingWS });
sync.start();
await sleep(2000);
const list = store.createList({ name: 'Groceries' });
for (let i = 0; i < 120; i++) store.addItem({ listId: list.id, text: `Item ${i}` });
for (let i = 0; i < 40; i++) store.addLog({ kind: i % 2 ? 'feed' : 'sleep', startAt: Date.now() - i * 3600_000, endAt: i % 2 ? null : Date.now() - i * 3600_000 + 1800_000 });
await settle(sync, 9000);
sync.stop();
const records = store.all().length;
console.log(`seeded ${records} records`);

// The real overlap on reopen is 10 minutes; shrink it here so the measurement
// shows the steady state (closed more than 10 minutes after the last change).
async function reopen(label, extra = {}) {
  const s = createSync({ keys, store, storage, WebSocketImpl: CountingWS, ...extra });
  perRelay.clear();
  s.resetStats();
  s.start();
  await settle(s);
  const st = s.stats();
  s.stop();
  console.log(`${label}: received ${(st.recvBytes / 1024).toFixed(1)} KB in ${st.recvEvents} events from ${DEFAULT_RELAYS.length} relays; sent ${(st.sentBytes / 1024).toFixed(1)} KB`);
  console.log('   per relay (records received / sent / told to slow down):', [...perRelay].map(([u, c]) => `${u} ${c.rx}/${c.tx}/${c.limited}`).join(', '));
  return st;
}
await sleep(6000);
await reopen('reopen, nothing changed', { sinceMarginS: 3 });
await sleep(6000);
await reopen('reopen again, nothing changed', { sinceMarginS: 3 });
store.addItem({ listId: list.id, text: 'one new thing' });
const w = createSync({ keys, store, storage, WebSocketImpl: CountingWS });
w.start();
await settle(w, 6000);
w.stop();
await sleep(6000);
await reopen('reopen after one change elsewhere', { sinceMarginS: 3 });
process.exit(0);

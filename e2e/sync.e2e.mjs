// End-to-end check against the real public relays: two "phones" that share a
// fresh family code must converge. Run with `npm run e2e` (needs network).
import { createStore } from '../src/store.js';
import { createSync, DEFAULT_RELAYS } from '../src/sync.js';
import { deriveKeys } from '../src/keys.js';
import { generateCode } from '../src/codes.js';

const code = generateCode();
console.log('family code:', code);
const keys = await deriveKeys(code);

function phone(name) {
  const store = createStore({});
  const sync = createSync({ keys, store, onStatus: (s) => process.env.VERBOSE && console.log(name, 'status', s) });
  sync.start();
  return { name, store, sync };
}

async function waitFor(desc, fn, ms = 20000) {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (fn()) {
      console.log('✓', desc, `(${Date.now() - start}ms)`);
      return;
    }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error('Timed out waiting for: ' + desc);
}

const a = phone('A');
await waitFor('A connects to at least 2 relays', () => a.sync.status().connected >= 2);

const list = a.store.createList({ name: 'Groceries', emoji: '🛒', createdBy: 'A' });
const milk = a.store.addItem({ listId: list.id, text: 'Milk', createdBy: 'A' });
a.store.addItem({ listId: list.id, text: 'Eggs', createdBy: 'A' });
await new Promise((r) => setTimeout(r, 1500));

// Phone B joins later with the same code and must receive everything.
const b = phone('B');
await waitFor('B receives the list', () => b.store.lists().length === 1);
await waitFor('B receives both items', () => b.store.itemsFor(list.id).length === 2);

// B checks off milk; A must see it live.
b.store.toggleItem(milk.id);
await waitFor('A sees Milk checked', () => a.store.get().items[milk.id]?.done === true);

// A deletes Eggs; B must see the tombstone.
const eggs = a.store.itemsFor(list.id).find((i) => i.text === 'Eggs');
a.store.deleteItem(eggs.id);
await waitFor('B sees Eggs deleted', () => b.store.itemsFor(list.id).length === 1);

// A goes offline, both edit, A comes back: last writer wins, nothing lost.
a.sync.stop();
b.store.addItem({ listId: list.id, text: 'Bread (from B while A offline)', createdBy: 'B' });
a.store.addItem({ listId: list.id, text: 'Butter (from A while offline)', createdBy: 'A' });
await new Promise((r) => setTimeout(r, 1000));
a.sync.start();
await waitFor('A gets Bread after reconnecting', () => a.store.itemsFor(list.id).some((i) => i.text.startsWith('Bread')));
await waitFor('B gets Butter after A reconnects', () => b.store.itemsFor(list.id).some((i) => i.text.startsWith('Butter')));

// A brand-new phone must be able to rebuild everything from the relays alone.
const c = phone('C');
await waitFor('C rebuilds full state from relays', () => c.store.itemsFor(list.id).length === 3 && c.store.lists().length === 1);

console.log('All sync checks passed. Relays used:', DEFAULT_RELAYS.join(', '));
a.sync.stop(); b.sync.stop(); c.sync.stop();
process.exit(0);

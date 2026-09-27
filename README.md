# Family To-Do

Shared to-do and shopping lists for a household. Open it on any phone, enter the
family code once, and every list stays in sync between everyone who has the code.

- Grocery list, house to-dos, a list just for you: any list, any emoji icon, all shared.
- Works offline; changes sync when you're back online.
- No accounts, no server to run, nothing to pay for.
- Installs to the iPhone home screen as an app (Safari → Share → *Add to Home Screen*).

## How to deploy (one time)

The app is a static site, built and published to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

1. Merge this branch into `main`.
2. Watch the **Deploy to GitHub Pages** workflow under the *Actions* tab. The first
   run enables GitHub Pages for the repo automatically.
3. The app is then live at `https://<your-github-username>.github.io/family-todo/`.

If the deploy job complains that Pages is not enabled, open *Settings → Pages* and
set **Source** to *GitHub Actions*, then re-run the workflow.

## How to use it

1. Open the site on your phone. Tap **Start a new family**. You get a code like
   `lucky-river-cabin-orbit`. Enter your name.
2. In *Settings*, tap **Share invite link** and send it to your partner (or just
   tell them the code). They open the link or tap **I have a family code**.
3. That's it. Both phones now show the same lists, live.

Anyone with the code can read and edit everything, which is the point: it is a
household, not a permission system. Keep the code between you. Codes are
generated from four random dictionary words (about 44 bits of entropy), which is
not guessable in practice.

## How syncing works

There is no app server. Each phone keeps its lists in local storage and mirrors
them to a handful of public [Nostr](https://nostr.com) relays, which are free,
open message stores that anyone can publish to and subscribe from.

- The family code is run through PBKDF2 to derive a secp256k1 key pair. That
  key signs every record, and its public key is the "address" both phones watch.
- Every list and item is one *replaceable* event (kind 30078) keyed by its id.
  Relays keep only the newest event per id, so they act as a last-writer-wins
  key/value store with live subscriptions.
- Content is encrypted (NIP-44) with a key also derived from the family code.
  Relays and anyone else see only ciphertext.
- Records merge by `updatedAt` timestamp. Deletes are tombstones, so a delete on
  one phone beats a stale edit from the other.
- After each connection the phone compares what the relay has with what it has
  and re-publishes anything missing. As long as one phone still has the data,
  the relays heal themselves. Five relays are used for redundancy; the relay
  list lives in `src/sync.js`.
- Normal app opens only fetch what changed since last time; a full re-sync runs
  once a week as a safety net.

Trade-offs worth knowing: public relays are run by volunteers and could
disappear or purge data. Because every phone holds a full copy and re-seeds the
relays, that only matters if all phones lose their data at the same time. If a
relay in the list goes away for good, replace it in `src/sync.js` and redeploy.

## Development

```
npm install
npm run dev        # local dev server
npm test           # unit tests (store merge logic + sync against an in-memory relay)
npm run e2e        # two simulated phones syncing through the real public relays
npm run build      # production build into dist/
npm run build:emoji  # regenerate src/emoji-data.json from the emoji packages
```

Stack: [Preact](https://preactjs.com), [Vite](https://vite.dev),
[nostr-tools](https://github.com/nbd-wtf/nostr-tools), vite-plugin-pwa.

```
src/
  app.jsx          boot: session -> keys -> store -> sync, routing
  store.js         local-first state, last-writer-wins merge, selectors
  sync.js          relay connections, publish/subscribe, reconcile, cursors
  keys.js          key derivation and encryption from the family code
  codes.js         family code generation and normalisation
  components/      Join, Home, ListView, Settings, Sheet, SyncBadge, EmojiPicker
e2e/sync.e2e.mjs   live check against the public relays
```

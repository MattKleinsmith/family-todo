# Family To-Do

Shared to-do and shopping lists for a household. Open it on any phone, enter the
family code once, and every list stays in sync between everyone who has the code.

- Grocery list, house to-dos, a list just for you: any list, with a themed icon from the built-in set or any emoji typed from your keyboard, all shared. New families start with Groceries, House and a personal list.
- A **Baby** tab that tracks when he slept and when he ate: one tap to log a feed
  or a nap, a status card that shows asleep/awake time, last feed and when the next
  one is due, a daily timeline with totals, and tap-to-fix times.
- Drag the grip on any list or item to reorder; the order syncs.
- Works offline; changes sync when you're back online.
- No accounts, no server to run, nothing to pay for.
- An **Activity** feed (the bell) that tells you exactly what the other person changed
  since you last looked: adds, renames, check-offs, deletions, icon changes, baby logs,
  and people joining or leaving. No more scanning lists against your memory.
- Installs to the iPhone home screen as an app (Safari → Share → *Add to Home Screen*).

## How to deploy (one time)

The app is a static site, built and published to GitHub Pages by
`.github/workflows/deploy.yml` on every push to `main`.

1. Merge this branch into `main`.
2. Watch the **Deploy to GitHub Pages** workflow under the *Actions* tab. The first
   run enables GitHub Pages for the repo automatically.
3. The app is then live at `https://<your-github-username>.github.io/family-todo/`.

The repo's Pages source is currently the `main` branch, so GitHub also runs its
own Jekyll build on each push. The deploy job waits for that build to finish so
the real app always wins. Setting *Settings → Pages → Source* to **GitHub
Actions** removes that extra build; it's optional.

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

## The baby tracker

Two buttons, always at the bottom of the Baby tab: **Fed now** and **Fell asleep**
(which turns into **Woke up** while a nap is running). Either parent taps; both
phones update within a second. The status card shows how long he has been asleep
or awake, when he last ate, and an estimate of the next feed and nap based on the
cycle length set in the tab's menu (default 3 hours; also where you set his name).
Both cycles count from the start of the last feed or nap to the start of the next.

Tap any entry in the timeline to fix its time (there are −30m/−15m/−5m nudges for
the "I forgot to tap" case), add a note like "5 oz", change feed↔sleep, or delete
it. Daily totals (feeds and hours slept) sit on each day's header. Sleep that
crosses midnight is split across the two days.

## The activity feed

The phone that makes a change writes a plain-language entry for it: "Huishi
checked off “Eggs” in Groceries", "Huishi renamed the list “Groceries” to
“Food”", "Huishi logged Augustine falling asleep at 10:00 AM". It knows exactly
what the record looked like before, so the wording is precise. Entries sync like
any other data (`src/activity.js`), grouped into chunks of 20 per phone per day
so relays see a few records a day rather than one per tap. Every phone,
including one that joins later, sees the whole history. Entries are kept for
180 days.

What you've seen is per phone. The bell counts other people's entries newer
than the last time you opened Activity; list cards flag unseen changes. A phone
that just joined sees the full history already marked as seen. Your own changes
are hidden unless you turn on "Show my own changes".

People and devices: each phone publishes a small synced "member" record when it
joins, changes its name, or leaves. Those appear in the feed and under
*Settings → Family members*.

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

### Limits, in one place

- **Shared data steady state: about 3 MB per family** (2 MB of lists and baby
  data, 1 MB of activity), growing roughly 0.1 MB a year. Baby logs older than 90 days are rolled into one small summary per day;
  deletion markers are dropped after 60 days (and relays are asked to drop them
  too, NIP-09); live list items are a few hundred records.
- **Per record**: relays accept up to 64–100 KB; ours are about 0.5 KB.
- **Per query**: relays return at most ~500 records; the app pages through.
- **Phone storage**: IndexedDB, at least 1 GB on iOS. (Before this it was
  localStorage at ~5 MB, which would have filled in about two years.)
- **Activity feed**: synced, kept 180 days. At ~30 changes a day that is
  roughly 1 MB per relay at steady state.
- **Practical bottleneck**: the one-time download when a new phone joins, about
  5–10 seconds on cellular, and it no longer grows with time.

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
```

Themed list icons are Google's [Noto Emoji](https://github.com/googlefonts/noto-emoji) artwork (Apache-2.0), a curated set in `public/icons/set`.

Stack: [Preact](https://preactjs.com), [Vite](https://vite.dev),
[nostr-tools](https://github.com/nbd-wtf/nostr-tools), vite-plugin-pwa.

```
src/
  app.jsx          boot: session -> keys -> store -> sync, routing
  store.js         local-first state, last-writer-wins merge, selectors
  baby.js          baby tracker helpers: current state, daily totals, formatting
  activity.js      the activity feed: describes each incoming change in plain words
  maintenance.js   compacts old baby logs into daily summaries, prunes old deletion markers
  kv.js            IndexedDB key/value storage (localStorage fallback)
  device.js        stable per-phone id and a friendly device label
  sync.js          relay connections, publish/subscribe, reconcile, cursors
  keys.js          key derivation and encryption from the family code
  codes.js         family code generation and normalisation
  components/      Join, Home, ListView, Baby, Activity, Bell, TabBar, Settings, Sheet, SyncBadge, EmojiPicker, Icons
e2e/sync.e2e.mjs   live check against the public relays
```

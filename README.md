# Family To-Do

Shared to-do and shopping lists for a household. Open it on any phone, enter the
family code once, and every list stays in sync between everyone who has the code.

- Grocery list, house to-dos, a list just for you: any list, with a themed icon from the built-in set or any emoji typed from your keyboard, all shared. New families start with Groceries, House and a personal list.
- A **Baby** tab that tracks when he slept and when he ate: one tap to log a feed
  or a nap, a status card that shows asleep/awake time, last feed and when the next
  one is due, a daily timeline with totals, and tap-to-fix times.
- A **House** tab for chores that come around every day, week or month (dishes,
  counters, mowing, the cat litter, draining the water heater), with an overdue
  flag when a whole day, week or month went by without one.
- Drag the grip on any list or item to reorder; the order syncs.
- Swipe any row left to delete it, like iOS: a short swipe shows a red Delete
  button, a long swipe deletes straight away (whole lists ask first). Every
  delete shows an Undo bar for a few seconds.
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

Two buttons, always at the bottom of the Baby tab: **Fed now** and **In bed**
(which turns into **Out of bed** while he's down). They log what you can see,
putting him in bed and taking him out, not the moment he actually fell asleep
or woke up. Either parent taps; both
phones update within a second. The top of the tab leads with two big countdowns,
**next nap** and **next feed** ("in 1h 20m", amber in the last 15 minutes, red
with "overdue by" once late), with how long he's been out of bed or in bed and when he
last ate in smaller type underneath. The next feed is counted from when the last
feed started (the feed cycle, default 3 hours); the next nap from when he last
came out of bed, from a nap or the night (default 2 hours). Both are set in the
tab's menu, along with his name. The tiles are buttons too: tapping **Next feed** logs a
feed, **Next nap** puts him in bed, and **Nap** / **Night sleep** takes him out
of bed, the same as the buttons below, each with an Undo.

A feed means he's awake: tapping **Fed now** while a nap is still running ends
the nap at that moment (someone forgot to tap **Out of bed**), with an Undo for a
dream feed. Moving that feed's time moves the wake-up with it.

**Night sleep.** A sleep started from 9 PM on (or in the evening once he's had
his 5th feed of the day) counts as his night sleep: the tab shows a moon and
"Night sleep" instead of a nap, and the feed countdown goes quiet ("when he
wakes") instead of turning red overnight. When he wakes, the morning feed is due
straight away and the countdowns pick up from there. A button on the sleep card
switches a sleep between nap and night sleep if the guess is wrong, and the
bedtime and feed count are set in the tab's menu.

Tap any entry in the timeline to fix its time (there are −30m/−15m/−5m/+5m nudges
for the "I forgot to tap" case, on both the fell-asleep and woke-up times), add a note like "5 oz", change feed↔sleep, or delete
it. Daily totals (feeds and hours slept) sit on each day's header. Sleep that
crosses midnight is split across the two days.

## The house tracker

Chores are grouped into **Every day**, **Every week**, **Every 2 weeks** and **Every month**. They stay in the order
you arranged, done or not, so the ones already ticked off stay in view next to
what's left. Overdue chores (a whole day, week or month went by without them)
are tinted amber or red. That includes the round a chore was added in (a monthly
chore added in September and not done shows "Missed last month" on October 1st),
unless it was added on that round's last day. Tapping "N overdue" at the top of the
tab scrolls to the first overdue chore and highlights it. Tap the
circle when one is done; it counts for the current day, week (Monday to Sunday), two-week
block (two of those weeks, the same blocks on every phone) or calendar month, then comes back around. Tap it again to undo.
To make a similar one, open a chore and tap **Duplicate**: the copy goes right
below it with the same settings (how often, days, times, owner, icon, link) but
no history, and opens with its name selected to rename.

A chore done several times a period can be **split**: open it and tap
**Split into N separate items**. It becomes N chores, once each, side by side
with the same settings, named by time of day for a daily 2× or 3× ("… (morning)",
"… (evening)") and numbered otherwise; this round's ticks are shared out among
them, older history stays with the first, and the toast has an Undo.

Not doing one this time? **Swipe it right to skip** this round (or open it
and tap **Skip today / this week / this month**). A skipped chore isn't done,
but it isn't missed either, it clears anything overdue before it, it drops
out of the "N of M done" counts, and it moves to the bottom of its group (the
one exception to your order, until the next round); swipe right again (or **Un-skip**) to take it
back. Swiping left still deletes.

Ticking it says you did it; to credit someone else, open it and tap the name
beside that day under **Done** (it flips to the other person, or opens a menu
with more than two of you).

Any chore or repeating item (House or any list: they're the same thing and use
the same controls) can be on **set days of the week**. Daily ones get "On these
days": Weekdays, Weekends, or single days to fine-tune (say, weekdays but not
Wednesday). Weekly ones get "On a set day": any day of the week, or pick its
days, so "every Wednesday" is Weekly + W. On its days off it's tucked behind a
"1 not on today · Show" row, it doesn't count toward today or the badge, and only
its own days can be missed ("Missed Friday" on a Monday, not "Missed 3 days").

Some chores happen more than once a period, like washing the bottles twice a day.
Set **How many times** (once, 2×, 3×, 4×, or type any number up to 99 under
**Other…**) and the circle splits into that many segments (a smooth ring past 8):
each tap fills one ("1 of 2 · last 8:10 AM · Huishi"), the last turns it into a
check, and tapping a finished chore takes the last one back. Each partial tick
also offers Undo.

If the previous period went by without it, the chore is flagged: amber for one
missed period ("Missed last week"), red for two or more ("Missed 3 weeks"). The
summary card lists what's overdue, and the House tab shows a badge with the count
from any screen. A chore isn't held against you for the period it was added in.

Tap a chore to give it to someone ("Whose job": anyone, or one person in the family;
it shows as a name tag on the row, "You" on their own phone), rename it, change how
often it comes around, pick an icon, see who
did it when, remove a completion, or mark it done on an earlier day ("I mowed on
Saturday but forgot to tap"). New families, and families upgrading to this version,
start with: wipe the counters and do the dishes (daily), mow the lawn and change the
cat litter (weekly), drain a gallon from the water heater (monthly).

### Your own list

Everyone in the family has one official personal list ("Matthew’s todos"),
shown on their own **Me** tab and left off their **Lists** tab; everyone
else sees it on theirs, next to the shared lists. It's made automatically the
first time each person opens the app (a new family's starter "<name>’s todos"
list becomes the creator's), it follows a rename, and it can be emptied but not
deleted. To fold an older list into it, open that list's ⋯ menu and choose
**Move everything to another list**: every item moves as it is (done ones stay
done, repeating ones keep their history), the old list can be deleted in the
same step, and one Undo puts it all back. The tabs start as **Baby, House, Me, Lists**; press and hold any
tab to drag them into another order (kept per phone).

### Repeating items in any list

Any item or chore, repeating or not, can carry a **link** (say, the Google Form
for a daily check-in): tap it and paste the link under "Link". The row then shows
a ↗ that opens the page in the browser; the app stays as it was, so you can come
back and tick it off. Only web (http/https) links are ever opened.

For personal habits that the rest of the family doesn't need front and centre
(practicing a language, reading), any list can have **repeating items**. Tap an
item and choose **Repeat** (daily, weekly, every 2 weeks or monthly), or pick
**Add a repeating item** from the list's ⋯ menu. They gather in a **Repeating**
group at the top of that list, work like chores (the circle, 2×, overdue colours,
history), and can go back to a one-off with **Stop repeating**. They don't appear
on the House tab or its badge, and ticking one off shows in the activity feed
without counting on anyone's bell.

## Picking up where you left off

iOS closes home-screen apps in the background and starts them afresh at their
start address. So each phone remembers (in localStorage, not synced) the
screen it was last on, each screen's scroll position, and which sections were
open ("Done", older days, "N not on today"); a fresh launch goes straight back
there (`src/viewstate.js`). A link that names a screen still opens that screen.

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
that just joined sees the full history already marked as seen. Your own changes,
from this device or any other device under your name (your Mac's changes on your
phone, say), never count on the bell or a list's "new changes" note, and are
hidden unless you turn on "Show my own changes".

People and devices: each phone publishes a small synced "member" record when it
joins, changes its name, or leaves. Those appear in the feed and under
*Settings → Family members*. The same name is the same person: someone on an
iPhone and a Mac is one row, "Matthew · iPhone, Mac", shares one personal list,
and a new device of theirs shows as "started using the app on a Mac" rather
than a new person joining. If a new device made its own personal list before
the existing one synced in, the two are folded back into the original.

After an app update, the feed also shows short **What's new** notes (with a ✨)
saying what changed; they count on the bell until you've looked, and tapping one
opens the screen it's about. The notes ship with the app (`src/changelog.js`), so
nothing extra is synced.

## How syncing works

There is no app server. Each phone keeps its lists in local storage and mirrors
them to a handful of public [Nostr](https://nostr.com) relays, which are free,
open message stores that anyone can publish to and subscribe from.

- The family code is run through PBKDF2 to derive a secp256k1 key pair. That
  key signs every record, and its public key is the "address" both phones watch.
- PBKDF2 is deliberately slow (120,000 rounds) and used to run on every launch,
  which was most of the "Opening your family…" wait. Each phone now derives the
  keys once (with the browser's native PBKDF2) and keeps them next to the
  family code it already stores; leaving the family forgets them. Startup is
  then just reading this phone's copy of the data from IndexedDB: the screen
  shows as soon as that's in (no spinner unless it takes over a second), and
  the relays are connected right after the first frame.
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
- **Opening the app** downloads only what changed since that phone last synced,
  plus a 10-minute overlap for clocks that disagree. Measured against the real
  relays with 161 records and nothing changed: about 0.5 KB, down from 386 KB.
  Nothing a relay has confirmed is re-sent.
- **Daily health check**: relays that support NIP-45 COUNT are asked how
  many records they hold; when that differs from what the phone holds (the
  relay is short, or the phone is), or the relay can't count, it gets a full
  re-download and re-upload.
- **Sync progress is kept with the records**: the per-relay cursors live in
  localStorage and the records in IndexedDB. If a phone opens with no saved
  records (site data cleared, a failed load), its cursors are dropped and it
  reads every relay from the start instead of only "what's new".
- **Relays that say "slow down"** get paused (5 s doubling to 2 min) and sent to
  more slowly (up to one write per 0.5 s), easing back after 10 accepted writes.

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
  house.js         house tracker helpers: day/week/month periods, done/due/overdue
  personal.js      each person's official list: find, set up, follow renames
  tabs.js          the bottom bar's tab order (per phone)
  activity.js      the activity feed: describes each incoming change in plain words
  maintenance.js   compacts old baby logs into daily summaries, prunes old deletion markers
  kv.js            IndexedDB key/value storage (localStorage fallback)
  device.js        stable per-phone id and a friendly device label
  sync.js          relay connections, publish/subscribe, reconcile, cursors
  keys.js          key derivation and encryption from the family code
  codes.js         family code generation and normalisation
  components/      Join, Home, ListView, Baby, House, Activity, Bell, TabBar, Settings, Sheet, SyncBadge, EmojiPicker, Icons
e2e/sync.e2e.mjs   live check against the public relays
```

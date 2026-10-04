// "What's new" notes, shown in the activity feed after an update. They ship
// with the app, so every phone shows them as soon as it has the new version;
// nothing is synced. Add one for every change people will notice, newest
// first: plain words, one or two sentences, and `href` to the place it's about.

export const CHANGELOG = [
  {
    id: 'tap-countdown-tiles',
    at: '2026-10-04T18:22:00-04:00',
    text: 'The big countdowns on the Baby tab are now buttons too: tap “Next feed” to log a feed, “Next nap” to log that he fell asleep, and “Napping” to log that he woke up. Each tap shows an Undo, in case you only meant to look.',
    href: '#/baby',
  },
  {
    id: 'add-row-tap-anywhere',
    at: '2026-10-04T14:27:00-04:00',
    text: 'Tapping the + next to “Add an item…” (or anywhere on that row) now starts typing, not just tapping the words.',
  },
  {
    id: 'nap-after-waking',
    at: '2026-10-02T12:30:00-04:00',
    text: 'The next-nap countdown now starts when the baby wakes up (2 hours awake, by default), not when he was last fed. You can change how long in the Baby tab’s settings.',
    href: '#/baby',
  },
  {
    id: 'skipped-to-bottom',
    at: '2026-10-02T10:09:00-04:00',
    text: 'Skipped chores and repeating items now drop to the bottom of their group so they’re out of the way. Everything else keeps your order, and a skipped one goes back to its place when the next round starts (or if you un-skip it).',
  },
  {
    id: 'skip-a-round',
    at: '2026-10-02T09:55:00-04:00',
    text: 'Not doing a chore or repeating item this time? Swipe it right to skip it (or tap it and choose Skip). Skipped ones don’t count as missed and clear anything overdue; swipe again to un-skip. Swiping left still deletes.',
    href: '#/house',
  },
  {
    id: 'jump-to-overdue',
    at: '2026-10-01T15:44:00-04:00',
    text: 'Tap “2 overdue” at the top of the House tab to jump straight to the first overdue chore.',
    href: '#/house',
  },
  {
    id: 'overdue-from-the-start',
    at: '2026-10-01T15:40:00-04:00',
    text: 'A chore or repeating item now counts as overdue from its very first round: a monthly one added in September and not done by October shows “Missed last month”, the same for weekly and every 2 weeks. (Only something added on the last day of its round gets a pass.)',
    href: '#/house',
  },
  {
    id: 'item-links',
    at: '2026-10-01T12:38:00-04:00',
    text: 'Items and chores can have a link, like the Google Form for a daily check-in. Tap the item and paste it under “Link”; a ↗ then shows on the item to open it straight from the list. Fill it in, come back, and tick it off.',
  },
  {
    id: 'who-did-it',
    at: '2026-10-01T11:29:00-04:00',
    text: 'Ticking something off says you did it, but you can change that: open the chore or repeating item and tap the name next to a day under “Done” to hand it to the other person (or pick from a menu if there are more of you). The “Done” history is now at the top of that sheet.',
    href: '#/house',
  },
  {
    id: 'weekly-on-a-day',
    at: '2026-10-01T10:50:00-04:00',
    text: 'Anything that repeats, in any list or on the House tab, can now be “every Wednesday”: choose Weekly, then tap the day under “On a set day”. Picking days works the same everywhere, including when you first make an item repeat.',
  },
  {
    id: 'own-devices-not-news',
    at: '2026-10-01T10:37:00-04:00',
    text: 'Changes you make on your other devices (say, your Mac) no longer light up the bell or a list’s “new changes” note on your phone. They’re yours, so they’re not news.',
  },
  {
    id: 'chore-days-of-week',
    at: '2026-10-01T09:33:00-04:00',
    text: 'Daily chores and repeating items can now be set to some days only: pick Weekdays or Weekends under “On these days”, or tap single days (say, weekdays but not Wednesday). On other days they’re tucked away and can’t be missed.',
    href: '#/house',
  },
  {
    id: 'arranged-order-only',
    at: '2026-09-30T16:14:00-04:00',
    text: 'Chores and repeating items stay in the order you arranged them again, done or not, so what you’ve already ticked off stays in view. Overdue ones keep their amber or red colour.',
    href: '#/house',
  },
  {
    id: 'wake-nudges',
    at: '2026-09-30T14:40:00-04:00',
    text: 'When you fix a sleep, “Woke up at” now has the same −30m, −15m, −5m and +5m buttons as “Fell asleep at”.',
    href: '#/baby',
  },
  {
    id: 'sync-heal-members-by-person',
    at: '2026-09-30T14:10:00-04:00',
    text: 'Fixed a new phone or computer sometimes missing older lists and family members. Family members are now one row per person with their devices (“iPhone, Mac”), and a second “todos” list made on a new device is folded into your own.',
    href: '#/settings',
  },
  {
    id: 'settings-apply-instantly',
    at: '2026-09-30T14:10:00-04:00',
    text: 'Baby settings now take effect as soon as you pick them; swiping the sheet away keeps them. App settings are at the top of the Baby settings and in the ⋯ menu on your own list, and on a computer the page scrolls from anywhere in the window.',
    href: '#/baby',
  },
  {
    id: 'night-sleep',
    at: '2026-09-29T23:36:00-04:00',
    text: 'Once the baby goes down for the night (after 9 PM, or after his 5th feed in the evening), the Baby tab shows “Night sleep” and stops counting down to a feed until he wakes. A button on the sleep card switches between nap and night sleep, and the bedtime is in the tab’s menu.',
    href: '#/baby',
  },
  {
    id: 'overdue-first',
    at: '2026-09-29T23:36:00-04:00',
    text: 'Overdue chores and repeating items now sit at the top of their group with a coloured edge, so they’re hard to miss. Then come the ones still to do, then the done ones.',
    href: '#/house',
  },
  {
    id: 'done-sink-to-bottom',
    at: '2026-09-29T23:26:12-04:00',
    text: 'Repeating items and chores you’ve done now move below the ones still to do, in the order you arranged them. When they reset the next day (or week), your original order is back.',
  },
  {
    id: 'repeat-times-inline',
    at: '2026-09-29T15:14:25-04:00',
    text: 'When you make a list item repeat, “How many times” now appears right under it, so a “3× a day” habit can be set up in one go.',
  },
  {
    id: 'any-number-of-times',
    at: '2026-09-29T15:10:33-04:00',
    text: 'A chore or repeating item can now be done any number of times a day, week or month: pick “Other…” under “How many times” and type a number.',
    href: '#/house',
  },
  {
    id: 'add-row-in-list',
    at: '2026-09-29T12:59:44-04:00',
    text: 'Adding to a list now happens in the list itself: “Add an item…” is its last row, so nothing floats over your items. On a long list, the + at the top jumps straight to it.',
  },
  {
    id: 'me-tab',
    at: '2026-09-29T12:48:05-04:00',
    text: 'The “My list” tab is now called “Me”.',
    href: '#/mine',
  },
  {
    id: 'move-everything',
    at: '2026-09-29T12:45:15-04:00',
    text: 'You can move a whole list into another one, for example an old list into My list. Open the list’s ⋯ menu and tap “Move everything to another list”. Done items stay done, repeating ones keep their history, and the old list can be deleted in the same step.',
  },
  {
    id: 'my-list-tab',
    at: '2026-09-29T12:13:16-04:00',
    text: 'Everyone now has their own list with its own “My list” tab. Everyone else can still see it on their Lists tab. Press and hold any tab to rearrange the tabs.',
    href: '#/mine',
  },
  {
    id: 'feed-ends-nap',
    at: '2026-09-29T12:05:44-04:00',
    text: 'Forgot to tap “Woke up”? Tapping “Fed now” during a nap now ends the nap at that moment. If he was fed in his sleep, tap Undo.',
    href: '#/baby',
  },
  {
    id: 'repeating-list-items',
    at: '2026-09-29T11:05:29-04:00',
    text: 'Any list can now have repeating items, like “Practice Chinese” every day. Tap an item and pick how often under “Repeat”. They stay in that list, not on the House tab, and ticking them off doesn’t ping everyone’s bell.',
  },
  {
    id: 'icon-picker-one-scroll',
    at: '2026-09-29T08:09:20-04:00',
    text: 'Picking an icon no longer means scrolling a little box inside a scrolling sheet. It shows two rows of likely icons, and the “More icons” button opens the rest.',
  },
  {
    id: 'chore-every-2-weeks',
    at: '2026-09-29T08:02:58-04:00',
    text: 'Chores can now come around every 2 weeks, like changing the sheets. Pick “2 weeks” under “How often”.',
    href: '#/house',
  },
  {
    id: 'whats-new-notes',
    at: '2026-09-28T21:20:00-04:00',
    text: 'After each update, a short note like this one shows up here saying what changed.',
  },
  {
    id: 'chore-times',
    at: '2026-09-28T21:17:25-04:00',
    text: 'Chores can be done more than once a day, week or month, like washing the bottles twice a day. Set “How many times” on the chore and its circle fills in one piece per time.',
    href: '#/house',
  },
  {
    id: 'tab-order',
    at: '2026-09-28T18:21:15-04:00',
    text: 'The tabs are now Baby, House, Lists: the things that come around most often first.',
  },
  {
    id: 'baby-countdowns',
    at: '2026-09-28T14:15:20-04:00',
    text: 'The Baby tab now leads with big countdowns to the next nap and the next feed. They turn amber when close and red once overdue.',
    href: '#/baby',
  },
  {
    id: 'seen-on-open',
    at: '2026-09-28T14:10:53-04:00',
    text: 'Opening a list now clears its “new changes” note and its count on the bell. The Baby and House tabs do the same for their changes.',
  },
  {
    id: 'chore-owners',
    at: '2026-09-28T13:57:53-04:00',
    text: 'Chores can belong to someone. Tap a chore and pick “Whose job”. Yours say “You”.',
    href: '#/house',
  },
  {
    id: 'small-fixes-1',
    at: '2026-09-28T13:36:12-04:00',
    text: 'Fixes: chore changes are kept however you close the sheet, keycap emoji like 1️⃣ work as icons, and chore icons line up with their circle.',
  },
  {
    id: 'swipe-delete',
    at: '2026-09-28T13:12:23-04:00',
    text: 'Swipe any row left to delete it, like on iPhone. Every delete can be undone for a few seconds.',
  },
  {
    id: 'house-tab',
    at: '2026-09-28T12:34:48-04:00',
    text: 'New House tab for daily, weekly and monthly chores. A chore turns amber, then red, when a whole day, week or month goes by without it.',
    href: '#/house',
  },
];

// "What's new" notes, shown in the activity feed after an update. They ship
// with the app, so every phone shows them as soon as it has the new version;
// nothing is synced. Add one for every change people will notice, newest
// first: plain words, one or two sentences, and `href` to the place it's about.

export const CHANGELOG = [
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

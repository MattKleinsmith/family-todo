// Sync over public Nostr relays.
//
// Each list/item is published as a "parameterized replaceable" event
// (kind 30078, NIP-78 app data) whose `d` tag is the record id. Relays keep
// only the newest event per (pubkey, d), which gives us free last-writer-wins
// storage that both phones can subscribe to in real time. Content is NIP-44
// encrypted with a key derived from the family code, so relays see nothing.
//
// The phone's local store is the source of truth. After every (re)connect we
// compare what a relay has against what we have and push anything it is
// missing, so the relays heal themselves as long as one phone still has the
// data. Using several relays gives redundancy if one goes away.
//
// Per relay we remember (in localStorage) the newest event time we saw and how
// far that relay has confirmed holding our records, so a normal app open only
// fetches what changed since last time (plus a 10-minute overlap for clock
// differences between phones) and re-sends nothing the relay already has.
//
// Every day each relay gets a health check: relays that support NIP-45 COUNT
// are asked how many of our records they hold, and only when that differs
// from what this phone holds (either side short) or the relay can't count do
// we do a full re-download and re-upload.
//
// The cursors live in localStorage but the records in IndexedDB, so the two
// can disagree (site data partly cleared, a load that failed). If the store
// opened with nothing restored, the cursors are thrown away and every relay
// is read from the start.
//
// Relays that say "slow down" get it: we pause, space our writes further apart,
// and ease back once they're accepting again.

import { finalizeEvent, verifyEvent } from 'nostr-tools/pure';
import { encrypt, decrypt, ciphertextLength } from './keys.js';
import { isValidEntity } from './store.js';

export const DEFAULT_RELAYS = [
  'wss://relay.damus.io',
  'wss://nos.lol',
  'wss://relay.primal.net',
  'wss://nostr.mom',
  'wss://relay.snort.social',
];

const KIND = 30078;
const TAG_PREFIX = 'ft:';
const PAGE = 500;
const PUBLISH_SPACING_MS = 25;
const MAX_SPACING_MS = 500;
const SINCE_MARGIN_S = 10 * 60; // overlap on reopen, to tolerate clocks that disagree a little
const COUNT_TIMEOUT_MS = 4000;
const FULL_SYNC_EVERY_MS = 24 * 3600 * 1000;
// Bump when a build adds a record type (see cursorKey), or to have every phone
// re-read and re-upload everything once. 3: heal phones that joined with
// cursors ahead of their records.
export const SYNC_SCHEMA = 3;

export function dTagFor(entity) {
  return `${TAG_PREFIX}${entity.type}:${entity.id}`;
}

/** Bytes a record occupies on a relay: its encrypted content inside the signed event envelope. Exact, no signing needed. */
export function relaySizeOf(entity) {
  const envelope = JSON.stringify({
    id: 'x'.repeat(64),
    pubkey: 'x'.repeat(64),
    created_at: 1_000_000_000,
    kind: KIND,
    tags: [['d', dTagFor(entity)]],
    content: '',
    sig: 'x'.repeat(128),
  }).length;
  return envelope + ciphertextLength(JSON.stringify(entity));
}

export function createSync({
  keys,
  store,
  relays = DEFAULT_RELAYS,
  onStatus = () => {},
  WebSocketImpl = globalThis.WebSocket,
  storage = globalThis.localStorage,
  now = () => Date.now(),
  fullSyncEveryMs = FULL_SYNC_EVERY_MS,
  sinceMarginS = SINCE_MARGIN_S,
  throttleBaseMs = 5000,
}) {
  const conns = new Map();
  const signedCache = new Map(); // `${id}:${updatedAt}` -> signed event
  let stopped = true;
  let lastSyncAt = null;
  let caughtUp = false;
  let subCounter = 0;
  // Versioned: a phone running an older build drops record types it doesn't
  // know yet but still moves its cursors past them, so a build that adds a
  // type reads everything once more under a new key.
  const cursorKey = `ft:sync:v${SYNC_SCHEMA}:${keys.pk}`;
  try {
    for (let v = 1; v < SYNC_SCHEMA; v++) storage && storage.removeItem(v === 1 ? `ft:sync:${keys.pk}` : `ft:sync:v${v}:${keys.pk}`);
  } catch {
    /* ignore */
  }
  if (store.startedEmpty && store.startedEmpty()) {
    try {
      storage && storage.removeItem(cursorKey);
    } catch {
      /* ignore */
    }
  }
  let cursors = loadCursors();

  // Lifetime traffic from this phone to the relays, for the debug panel.
  const statsKey = `ft:stats:${keys.pk}`;
  let stats = loadStats();
  let statsTimer = null;
  function loadStats() {
    try {
      const parsed = JSON.parse((storage && storage.getItem(statsKey)) || 'null');
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      /* ignore */
    }
    return { sentBytes: 0, recvBytes: 0, sentEvents: 0, recvEvents: 0, since: now() };
  }
  function saveStats() {
    if (!storage) return;
    clearTimeout(statsTimer);
    statsTimer = setTimeout(() => {
      try {
        storage.setItem(statsKey, JSON.stringify(stats));
      } catch {
        /* ignore */
      }
    }, 2000);
  }
  function resetStats() {
    stats = { sentBytes: 0, recvBytes: 0, sentEvents: 0, recvEvents: 0, since: now() };
    saveStats();
  }

  function loadCursors() {
    try {
      const raw = storage && storage.getItem(cursorKey);
      const parsed = raw ? JSON.parse(raw) : null;
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  let cursorTimer = null;
  function saveCursors() {
    if (!storage) return;
    clearTimeout(cursorTimer);
    cursorTimer = setTimeout(() => {
      try {
        storage.setItem(cursorKey, JSON.stringify(cursors));
      } catch {
        /* ignore */
      }
    }, 100);
  }

  function cursor(url) {
    if (!cursors[url]) cursors[url] = { newest: 0, ackedUpTo: 0, fullSyncAt: 0, syncedAt: 0 };
    return cursors[url];
  }

  function status() {
    let connected = 0;
    for (const c of conns.values()) if (c.ws && c.ws.readyState === 1) connected++;
    // caughtUp: some relay has sent everything it holds since this session started.
    return { connected, total: relays.length, lastSyncAt, online: connected > 0, caughtUp };
  }

  function relayStates() {
    return relays.map((url) => {
      const c = conns.get(url);
      const open = !!(c && c.ws && c.ws.readyState === 1);
      return {
        url,
        connected: open,
        connecting: !!(c && c.ws && c.ws.readyState === 0),
        known: c ? c.known.size : 0,
        throttled: c ? c.throttled : 0,
        slowedDown: !!(c && c.spacing > PUBLISH_SPACING_MS),
        lastCount: c ? c.lastCount : null,
      };
    });
  }

  function emitStatus() {
    onStatus(status());
  }

  // Relays keep one event per record and compare them by created_at, which is
  // in whole seconds; on a tie they keep the lower event id, which may be the
  // older version. So every new version of a record gets a created_at strictly
  // later than any we've published or seen for it.
  const lastCreated = new Map(); // record id -> newest created_at seen or sent

  function noteCreated(id, createdAt) {
    if (!(lastCreated.get(id) >= createdAt)) lastCreated.set(id, createdAt);
  }

  function eventFor(entity) {
    const key = `${entity.id}:${entity.updatedAt}`;
    let ev = signedCache.get(key);
    if (!ev) {
      const createdAt = Math.max(Math.floor(now() / 1000), (lastCreated.get(entity.id) ?? 0) + 1);
      noteCreated(entity.id, createdAt);
      ev = finalizeEvent(
        {
          kind: KIND,
          created_at: createdAt,
          tags: [['d', dTagFor(entity)]],
          content: encrypt(entity, keys.convKey),
        },
        keys.sk,
      );
      signedCache.set(key, ev);
      if (signedCache.size > 2000) signedCache.delete(signedCache.keys().next().value);
    }
    return ev;
  }

  function send(conn, msg) {
    if (!conn.ws || conn.ws.readyState !== 1) return;
    const raw = JSON.stringify(msg);
    conn.ws.send(raw);
    stats.sentBytes += raw.length;
    if (msg[0] === 'EVENT') stats.sentEvents++;
    saveStats();
  }

  // ---- Publishing ----

  function queuePublish(conn, entity) {
    const known = conn.known.get(entity.id);
    if (known !== undefined && known >= entity.updatedAt) return;
    if (conn.failed.has(`${entity.id}:${entity.updatedAt}`)) return;
    // If an older version of this record is still waiting, send only the newest.
    const queued = conn.queue.findIndex((e) => e.id === entity.id);
    if (queued >= 0) {
      if (conn.queue[queued].updatedAt < entity.updatedAt) conn.queue[queued] = entity;
      return;
    }
    conn.queue.push(entity);
    drain(conn);
  }

  function drain(conn) {
    if (conn.draining) return;
    conn.draining = true;
    const step = () => {
      if (stopped || !conn.ws || conn.ws.readyState !== 1 || conn.queue.length === 0) {
        conn.draining = false;
        scheduleAck();
        return;
      }
      const wait = conn.pauseUntil - now();
      if (wait > 0) {
        setTimeout(step, wait); // the relay asked us to slow down
        return;
      }
      const entity = conn.queue.shift();
      const ev = eventFor(entity);
      conn.pending.set(ev.id, entity);
      send(conn, ['EVENT', ev]);
      setTimeout(step, conn.spacing);
    };
    step();
  }

  function publish(entity) {
    for (const conn of conns.values()) queuePublish(conn, entity);
  }

  /**
   * Ask the relays to drop records we've pruned (NIP-09 deletion request,
   * addressing each replaceable record by its `a` coordinate). Best effort:
   * a relay that ignores it just keeps a small deletion marker around.
   */
  function publishDeletion(dTags) {
    if (!dTags.length) return;
    for (let i = 0; i < dTags.length; i += 50) {
      const chunk = dTags.slice(i, i + 50);
      const ev = finalizeEvent(
        {
          kind: 5,
          created_at: Math.floor(now() / 1000),
          tags: chunk.map((d) => ['a', `${KIND}:${keys.pk}:${d}`]),
          content: 'pruned',
        },
        keys.sk,
      );
      for (const conn of conns.values()) send(conn, ['EVENT', ev]);
    }
  }

  /**
   * How far each relay is caught up: the latest time T such that the relay has
   * confirmed holding (or served us) every one of our records changed up to T.
   * Records it permanently refused count as done, so one bad record can't pin
   * the cursor. Recomputed shortly after confirmations arrive.
   */
  let ackTimer = null;
  function scheduleAck() {
    if (ackTimer) return;
    ackTimer = setTimeout(() => {
      ackTimer = null;
      for (const conn of conns.values()) advanceAck(conn);
      saveCursors();
    }, 300);
  }

  /**
   * While a relay is caught up and live, we've seen everything it has up to
   * now. Anything published later is stamped later (give or take clock
   * differences, covered by the reopen overlap), so the next reopen only needs
   * to look back from this moment.
   */
  function touchSynced(conn) {
    if (conn.live && conn.ws && conn.ws.readyState === 1) cursor(conn.url).syncedAt = Math.floor(now() / 1000);
  }

  function advanceAck(conn) {
    touchSynced(conn);
    const c = cursor(conn.url);
    let pendingMin = Infinity;
    let max = c.ackedUpTo;
    for (const e of store.all()) {
      if (e.updatedAt <= c.ackedUpTo) continue;
      const k = conn.known.get(e.id);
      if ((k !== undefined && k >= e.updatedAt) || conn.failed.has(`${e.id}:${e.updatedAt}`)) {
        if (e.updatedAt > max) max = e.updatedAt;
      } else if (e.updatedAt < pendingMin) pendingMin = e.updatedAt;
    }
    const next = pendingMin === Infinity ? max : pendingMin - 1;
    if (next > c.ackedUpTo) c.ackedUpTo = next;
  }

  // ---- Receiving ----

  function noteRelayHas(conn, entity) {
    // `known` is "the version this relay currently holds", so always overwrite.
    conn.known.set(entity.id, entity.updatedAt);
    // If we hold something newer, the relay is stale: push ours.
    const local = store.getEntity(entity.type, entity.id);
    if (local && local.updatedAt > entity.updatedAt) queuePublish(conn, local);
  }

  function handleIncoming(conn, ev) {
    if (ev.kind !== KIND || ev.pubkey !== keys.pk) return;
    const d = ev.tags.find((t) => t[0] === 'd')?.[1] || '';
    if (!d.startsWith(TAG_PREFIX)) return;
    if (!verifyEvent(ev)) return;
    let entity;
    try {
      entity = decrypt(ev.content, keys.convKey);
    } catch {
      return; // not ours / corrupted
    }
    if (!isValidEntity(entity) || dTagFor(entity) !== d) return;
    noteCreated(entity.id, ev.created_at);
    store.applyRemote(entity);
    noteRelayHas(conn, entity);
    scheduleAck();
    lastSyncAt = now();
  }

  function reconcile(conn) {
    const c = cursor(conn.url);
    // We've now seen everything this relay had, and from here on the live
    // subscription delivers whatever is published. So the "seen up to" time
    // keeps moving while we're connected (see touchSynced).
    conn.live = true;
    caughtUp = true;
    touchSynced(conn);
    const floor = conn.fullMode ? 0 : c.ackedUpTo;
    for (const entity of store.all()) {
      if (entity.updatedAt > floor) queuePublish(conn, entity);
    }
    if (conn.fullMode) {
      c.fullSyncAt = now();
      conn.fullMode = false;
    }
    saveCursors();
    lastSyncAt = now();
    emitStatus();
    scheduleAck();
  }

  // ---- Connection lifecycle ----

  function subscribe(conn, filter) {
    const id = `s${++subCounter}`;
    conn.subs.set(id, { filter, count: 0, minCreated: Infinity });
    send(conn, ['REQ', id, { kinds: [KIND], authors: [keys.pk], ...filter }]);
    return id;
  }

  function onMessage(conn, raw) {
    let msg;
    stats.recvBytes += typeof raw === 'string' ? raw.length : 0;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    const [type] = msg;
    if (type === 'EVENT') stats.recvEvents++;
    if (type === 'EVENT') {
      const [, subId, ev] = msg;
      const sub = conn.subs.get(subId);
      if (sub && ev && typeof ev.created_at === 'number') {
        sub.count++;
        if (ev.created_at < sub.minCreated) sub.minCreated = ev.created_at;
        const c = cursor(conn.url);
        if (ev.created_at > c.newest) {
          c.newest = ev.created_at;
          saveCursors();
        }
      }
      handleIncoming(conn, ev);
    } else if (type === 'EOSE') {
      const [, subId] = msg;
      const sub = conn.subs.get(subId);
      if (!sub) return;
      if (subId !== conn.liveSub) {
        send(conn, ['CLOSE', subId]);
        conn.subs.delete(subId);
      }
      if (sub.count >= PAGE && sub.minCreated !== Infinity) {
        // The relay capped the response; page backwards until we have everything.
        const { since } = sub.filter;
        subscribe(conn, { ...(since ? { since } : {}), until: sub.minCreated, limit: PAGE });
      } else {
        reconcile(conn);
      }
    } else if (type === 'OK') {
      const [, evId, ok, reason] = msg;
      const entity = conn.pending.get(evId);
      conn.pending.delete(evId);
      if (!entity) return;
      if (ok) {
        noteRelayHas(conn, entity);
        touchSynced(conn);
        lastSyncAt = now();
        // After a good run, ease back towards full speed.
        if (++conn.okStreak >= 10) {
          conn.okStreak = 0;
          conn.spacing = Math.max(PUBLISH_SPACING_MS, Math.floor(conn.spacing / 2));
          conn.throttle = 0;
        }
        emitStatus();
      } else if (/rate|slow|too many|limit/i.test(reason || '')) {
        // Back off: pause this relay, double the pause each time (up to 2 min),
        // and space further writes out. Put the event back at the front.
        conn.okStreak = 0;
        conn.throttle = Math.min(Math.max(conn.throttle * 2, throttleBaseMs), 120_000);
        conn.pauseUntil = now() + conn.throttle;
        conn.spacing = Math.min(conn.spacing * 2, MAX_SPACING_MS);
        conn.throttled++;
        if (!conn.queue.some((e) => e.id === entity.id)) conn.queue.unshift(entity);
        drain(conn);
      } else if (/duplicate|replaced|have newer/i.test(reason || '')) {
        // The relay already has this version or a newer one.
        noteRelayHas(conn, entity);
      } else {
        conn.failed.add(`${entity.id}:${entity.updatedAt}`);
        console.warn('Relay rejected event', conn.url, reason);
      }
      scheduleAck();
    } else if (type === 'COUNT') {
      const [, id, body] = msg;
      if (conn.countCheck && conn.countCheck.id === id) finishCountCheck(conn, body && typeof body.count === 'number' ? body.count : null);
    } else if (type === 'CLOSED') {
      if (conn.countCheck && conn.countCheck.id === msg[1]) finishCountCheck(conn, null);
    } else if (type === 'NOTICE') {
      // Relays that don't know COUNT answer with a NOTICE; treat that as "can't count".
      if (conn.countCheck) finishCountCheck(conn, null);
      console.info('Relay notice', conn.url, msg[1]);
    }
  }

  /** Health check before a periodic full re-sync: skip it only if the relay holds exactly as many records as we do. */
  function startCountCheck(conn) {
    const id = `c${++subCounter}`;
    conn.countCheck = { id, timer: setTimeout(() => finishCountCheck(conn, null), COUNT_TIMEOUT_MS) };
    send(conn, ['COUNT', id, { kinds: [KIND], authors: [keys.pk] }]);
  }

  function finishCountCheck(conn, count) {
    const check = conn.countCheck;
    if (!check) return;
    clearTimeout(check.timer);
    conn.countCheck = null;
    const c = cursor(conn.url);
    conn.lastCount = count;
    if (count !== null && count === store.all().length) {
      c.fullSyncAt = now();
      saveCursors();
      startBackfill(conn, false);
    } else {
      startBackfill(conn, true);
    }
  }

  function startBackfill(conn, full) {
    const c = cursor(conn.url);
    conn.fullMode = full;
    const from = Math.max(c.newest || 0, c.syncedAt || 0);
    const filter = full ? { limit: PAGE } : { since: Math.max(0, from - sinceMarginS), limit: PAGE };
    conn.liveSub = subscribe(conn, filter);
    if (full) conn.fullSyncs++;
  }

  function connect(url) {
    let conn = conns.get(url);
    if (!conn) {
      conn = {
        url,
        ws: null,
        known: new Map(),
        failed: new Set(),
        pending: new Map(),
        queue: [],
        draining: false,
        subs: new Map(),
        liveSub: null,
        fullMode: false,
        countCheck: null,
        lastCount: null,
        spacing: PUBLISH_SPACING_MS,
        throttle: 0,
        pauseUntil: 0,
        okStreak: 0,
        throttled: 0,
        fullSyncs: 0,
        backoff: 1000,
        timer: null,
      };
      conns.set(url, conn);
    }
    if (conn.ws && (conn.ws.readyState === 0 || conn.ws.readyState === 1)) return;
    clearTimeout(conn.timer);
    let ws;
    try {
      ws = new WebSocketImpl(url);
    } catch {
      scheduleReconnect(conn);
      return;
    }
    conn.ws = ws;
    ws.onopen = () => {
      conn.live = false;
      conn.backoff = 1000;
      conn.subs.clear();
      conn.queue.length = 0;
      conn.pending.clear();
      conn.draining = false;
      const c = cursor(url);
      if (!c.newest || !c.fullSyncAt) startBackfill(conn, true); // first time with this relay
      else if (now() - c.fullSyncAt > fullSyncEveryMs) startCountCheck(conn); // periodic health check
      else startBackfill(conn, false);
      emitStatus();
    };
    ws.onmessage = (m) => onMessage(conn, m.data);
    ws.onerror = () => {};
    ws.onclose = () => {
      conn.live = false;
      conn.ws = null;
      emitStatus();
      scheduleReconnect(conn);
    };
  }

  function scheduleReconnect(conn) {
    if (stopped) return;
    clearTimeout(conn.timer);
    conn.timer = setTimeout(() => connect(conn.url), conn.backoff);
    conn.backoff = Math.min(conn.backoff * 2, 30_000);
  }

  function reconnectAll() {
    if (stopped) return;
    for (const url of relays) {
      const conn = conns.get(url);
      if (conn) conn.backoff = 1000;
      connect(url);
    }
  }

  const onVisible = () => {
    if (typeof document === 'undefined' || document.visibilityState === 'visible') reconnectAll();
  };

  let heartbeat = null;
  let unsubscribeLocal = null;
  function start() {
    if (!stopped) return;
    stopped = false;
    cursors = loadCursors();
    unsubscribeLocal = store.onLocalChange(publish);
    // Keep the "seen up to" time moving while connected, so an idle phone that
    // gets closed (or killed in the background) doesn't re-fetch on reopen.
    heartbeat = setInterval(() => {
      for (const conn of conns.values()) touchSynced(conn);
      saveCursors();
    }, 60_000);
    for (const url of relays) connect(url);
    if (typeof window !== 'undefined') {
      window.addEventListener('online', reconnectAll);
      window.addEventListener('focus', reconnectAll);
      window.addEventListener('pageshow', reconnectAll);
      document.addEventListener('visibilitychange', onVisible);
    }
    emitStatus();
  }

  function stop() {
    stopped = true;
    if (unsubscribeLocal) unsubscribeLocal();
    if (typeof window !== 'undefined') {
      window.removeEventListener('online', reconnectAll);
      window.removeEventListener('focus', reconnectAll);
      window.removeEventListener('pageshow', reconnectAll);
      document.removeEventListener('visibilitychange', onVisible);
    }
    clearTimeout(ackTimer);
    ackTimer = null;
    clearInterval(heartbeat);
    for (const conn of conns.values()) {
      advanceAck(conn); // keep confirmations that arrived just before closing
      clearTimeout(conn.timer);
      if (conn.countCheck) clearTimeout(conn.countCheck.timer);
      if (conn.ws) {
        conn.ws.onclose = null;
        conn.ws.close();
      }
      conn.ws = null;
    }
    conns.clear();
    clearTimeout(cursorTimer);
    clearTimeout(statsTimer);
    try {
      storage && storage.setItem(cursorKey, JSON.stringify(cursors));
      storage && storage.setItem(statsKey, JSON.stringify(stats));
    } catch {
      /* ignore */
    }
    emitStatus();
  }

  return { start, stop, publish, publishDeletion, status, reconnectAll, relayStates, stats: () => ({ ...stats }), resetStats };
}

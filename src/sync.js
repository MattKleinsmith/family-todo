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
// far our own writes have been acknowledged, so a normal app open only fetches
// what changed since last time. A full re-sync runs every two weeks as a safety
// net against clock skew or a relay that lost data.

import { finalizeEvent, verifyEvent } from 'nostr-tools/pure';
import { encrypt, decrypt } from './keys.js';
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
const SINCE_MARGIN_S = 24 * 3600; // re-fetch a day of overlap: cheap, and tolerant of clock skew
const FULL_SYNC_EVERY_MS = 14 * 24 * 3600 * 1000;

export function dTagFor(entity) {
  return `${TAG_PREFIX}${entity.type}:${entity.id}`;
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
}) {
  const conns = new Map();
  const signedCache = new Map(); // `${id}:${updatedAt}:${minute}` -> signed event
  let stopped = true;
  let lastSyncAt = null;
  let subCounter = 0;
  const cursorKey = `ft:sync:${keys.pk}`;
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
    if (!cursors[url]) cursors[url] = { newest: 0, ackedUpTo: 0, fullSyncAt: 0 };
    return cursors[url];
  }

  function status() {
    let connected = 0;
    for (const c of conns.values()) if (c.ws && c.ws.readyState === 1) connected++;
    return { connected, total: relays.length, lastSyncAt, online: connected > 0 };
  }

  function relayStates() {
    return relays.map((url) => {
      const c = conns.get(url);
      const open = !!(c && c.ws && c.ws.readyState === 1);
      return { url, connected: open, connecting: !!(c && c.ws && c.ws.readyState === 0), known: c ? c.known.size : 0 };
    });
  }

  function emitStatus() {
    onStatus(status());
  }

  function eventFor(entity) {
    const nowMs = now();
    const key = `${entity.id}:${entity.updatedAt}:${Math.floor(nowMs / 60000)}`;
    let ev = signedCache.get(key);
    if (!ev) {
      ev = finalizeEvent(
        {
          kind: KIND,
          created_at: Math.floor(nowMs / 1000),
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
    if (conn.queue.some((e) => e.id === entity.id && e.updatedAt >= entity.updatedAt)) return;
    conn.queue.push(entity);
    drain(conn);
  }

  function drain(conn) {
    if (conn.draining) return;
    conn.draining = true;
    const step = () => {
      if (stopped || !conn.ws || conn.ws.readyState !== 1 || conn.queue.length === 0) {
        conn.draining = false;
        maybeAdvanceAck(conn);
        return;
      }
      const entity = conn.queue.shift();
      const ev = eventFor(entity);
      conn.pending.set(ev.id, entity);
      send(conn, ['EVENT', ev]);
      setTimeout(step, PUBLISH_SPACING_MS);
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

  /** Once a reconcile round has fully drained with no failures, remember how far this relay is caught up. */
  function maybeAdvanceAck(conn) {
    if (conn.reconcileMax === null) return;
    if (conn.queue.length > 0 || conn.pending.size > 0 || conn.draining) return;
    if (!conn.reconcileFailed) {
      const c = cursor(conn.url);
      if (conn.reconcileMax > c.ackedUpTo) {
        c.ackedUpTo = conn.reconcileMax;
        saveCursors();
      }
    }
    conn.reconcileMax = null;
    conn.reconcileFailed = false;
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
    store.applyRemote(entity);
    noteRelayHas(conn, entity);
    lastSyncAt = now();
  }

  function reconcile(conn) {
    const c = cursor(conn.url);
    const floor = conn.fullMode ? 0 : c.ackedUpTo;
    let max = c.ackedUpTo;
    for (const entity of store.all()) {
      if (entity.updatedAt > max) max = entity.updatedAt;
      if (entity.updatedAt > floor) queuePublish(conn, entity);
    }
    if (conn.fullMode) {
      c.fullSyncAt = now();
      conn.fullMode = false;
    }
    conn.reconcileMax = max;
    conn.reconcileFailed = false;
    saveCursors();
    lastSyncAt = now();
    emitStatus();
    if (!conn.draining) maybeAdvanceAck(conn);
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
        lastSyncAt = now();
        emitStatus();
      } else if (/rate|slow|too many/i.test(reason || '')) {
        conn.reconcileFailed = true;
        setTimeout(() => queuePublish(conn, entity), 3000);
      } else {
        conn.reconcileFailed = true;
        conn.failed.add(`${entity.id}:${entity.updatedAt}`);
        console.warn('Relay rejected event', conn.url, reason);
      }
      if (!conn.draining) maybeAdvanceAck(conn);
    } else if (type === 'NOTICE') {
      console.info('Relay notice', conn.url, msg[1]);
    }
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
        reconcileMax: null,
        reconcileFailed: false,
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
      conn.backoff = 1000;
      conn.subs.clear();
      conn.queue.length = 0;
      conn.pending.clear();
      conn.draining = false;
      conn.reconcileMax = null;
      const c = cursor(url);
      const needFull = !c.fullSyncAt || now() - c.fullSyncAt > fullSyncEveryMs || !c.newest;
      conn.fullMode = needFull;
      const filter = needFull ? { limit: PAGE } : { since: Math.max(0, c.newest - SINCE_MARGIN_S), limit: PAGE };
      conn.liveSub = subscribe(conn, filter);
      emitStatus();
    };
    ws.onmessage = (m) => onMessage(conn, m.data);
    ws.onerror = () => {};
    ws.onclose = () => {
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

  let unsubscribeLocal = null;
  function start() {
    if (!stopped) return;
    stopped = false;
    cursors = loadCursors();
    unsubscribeLocal = store.onLocalChange(publish);
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
    for (const conn of conns.values()) {
      clearTimeout(conn.timer);
      if (conn.ws) {
        conn.ws.onclose = null;
        conn.ws.close();
      }
      conn.ws = null;
    }
    conns.clear();
    clearTimeout(cursorTimer);
    try {
      storage && storage.setItem(cursorKey, JSON.stringify(cursors));
    } catch {
      /* ignore */
    }
    emitStatus();
  }

  return { start, stop, publish, publishDeletion, status, reconnectAll, relayStates, stats: () => ({ ...stats }), resetStats };
}

// A stable id for this phone (survives leaving and rejoining) and a friendly label for it.
const KEY = 'ft:device';

export function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) {
      const buf = new Uint8Array(8);
      crypto.getRandomValues(buf);
      id = Array.from(buf, (b) => b.toString(16).padStart(2, '0')).join('');
      localStorage.setItem(KEY, id);
    }
    return id;
  } catch {
    return 'device';
  }
}

export function describeDevice(ua = typeof navigator !== 'undefined' ? navigator.userAgent : '') {
  if (/iPhone/.test(ua)) return 'iPhone';
  if (/iPad|Macintosh.*Mobile/.test(ua)) return 'iPad';
  if (/Android/.test(ua)) return 'Android phone';
  if (/Macintosh/.test(ua)) return 'Mac';
  if (/Windows/.test(ua)) return 'Windows PC';
  return 'device';
}

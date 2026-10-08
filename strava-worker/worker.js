// Peak — Cloudflare Worker: Strava OAuth relay + morning reminders (Web Push)
//
// This is NOT part of the static site and is not deployed by GitHub Pages. It runs as a
// Cloudflare Worker, deployed from the dashboard editor: no build step, no dependencies.
//
// Two jobs:
//   1. Strava relay (unchanged): exchange a code or refresh token for an access token using
//      the client secret, which can never ship in the app's own JS. Stateless.
//   2. Reminders: a phone registers its push subscription, the local time it wants a
//      reminder, its timezone and a small summary of its plan (date -> one line). A cron
//      trigger every 15 minutes sends each phone its line for the day at its chosen time.
//      Web Push is done by hand with WebCrypto (RFC 8291 aes128gcm + RFC 8292 VAPID).
//
// Bindings and settings this Worker needs (see PUSH-SETUP.md):
//   Secrets:  STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT
//   KV:       PEAK_PUSH   (one entry per phone, keyed by a hash of its push endpoint)
//   Cron:     */15 * * * *

const ALLOWED_ORIGIN = 'https://sarhana12-hub.github.io';
const SEND_WINDOW_MIN = 120; // a reminder due at 7:00 is still sent until 9:00 if a cron run was missed

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}
function json(data, status) {
  return new Response(JSON.stringify(data), { status: status || 200, headers: { ...corsHeaders(), 'Content-Type': 'application/json' } });
}

// ---------- base64url ----------
const b64u = {
  encode(buf) { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  decode(str) { str = String(str).replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; const bin = atob(str); const out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; },
};
const te = new TextEncoder();
function concat(...parts) { const len = parts.reduce((n, p) => n + p.byteLength, 0); const out = new Uint8Array(len); let o = 0; for (const p of parts) { out.set(new Uint8Array(p), o); o += p.byteLength; } return out; }
async function sha256hex(s) { const d = await crypto.subtle.digest('SHA-256', te.encode(s)); return [...new Uint8Array(d)].map(b => b.toString(16).padStart(2, '0')).join(''); }

// ---------- VAPID (RFC 8292): a short-lived ES256 JWT signed with our private key ----------
async function vapidAuthHeader(env, endpoint) {
  const aud = new URL(endpoint).origin;
  const header = b64u.encode(te.encode(JSON.stringify({ typ: 'JWT', alg: 'ES256' })));
  const claims = b64u.encode(te.encode(JSON.stringify({ aud, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT })));
  const pub = b64u.decode(env.VAPID_PUBLIC_KEY); // raw 65 bytes: 0x04 | x | y
  const jwk = { kty: 'EC', crv: 'P-256', x: b64u.encode(pub.slice(1, 33)), y: b64u.encode(pub.slice(33, 65)), d: env.VAPID_PRIVATE_KEY };
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, te.encode(header + '.' + claims)); // raw r||s, as JWT wants
  return `vapid t=${header}.${claims}.${b64u.encode(sig)}, k=${env.VAPID_PUBLIC_KEY}`;
}

// ---------- payload encryption (RFC 8291, aes128gcm) ----------
async function hkdf(salt, ikm, info, len) {
  const key = await crypto.subtle.importKey('raw', ikm, 'HKDF', false, ['deriveBits']);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: 'HKDF', hash: 'SHA-256', salt, info }, key, len * 8));
}
async function encryptPayload(sub, plaintext) {
  const uaPub = b64u.decode(sub.keys.p256dh);           // 65 bytes
  const auth = b64u.decode(sub.keys.auth);               // 16 bytes
  const local = await crypto.subtle.generateKey({ name: 'ECDH', namedCurve: 'P-256' }, true, ['deriveBits']);
  const asPub = new Uint8Array(await crypto.subtle.exportKey('raw', local.publicKey));
  const uaKey = await crypto.subtle.importKey('raw', uaPub, { name: 'ECDH', namedCurve: 'P-256' }, false, []);
  const shared = new Uint8Array(await crypto.subtle.deriveBits({ name: 'ECDH', public: uaKey }, local.privateKey, 256));
  const ikm = await hkdf(auth, shared, concat(te.encode('WebPush: info\0'), uaPub, asPub), 32);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const cek = await hkdf(salt, ikm, te.encode('Content-Encoding: aes128gcm\0'), 16);
  const nonce = await hkdf(salt, ikm, te.encode('Content-Encoding: nonce\0'), 12);
  const padded = concat(te.encode(plaintext), new Uint8Array([2])); // 0x02 = last record delimiter, no padding
  const aesKey = await crypto.subtle.importKey('raw', cek, 'AES-GCM', false, ['encrypt']);
  const cipher = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv: nonce }, aesKey, padded));
  const rs = new Uint8Array([0, 0, 16, 0]); // record size 4096
  return concat(salt, rs, new Uint8Array([asPub.length]), asPub, cipher);
}

// Sends one notification. Returns 'ok', 'gone' (subscription dead: delete it) or 'error'.
async function sendPush(env, sub, payload) {
  try {
    const body = await encryptPayload(sub, JSON.stringify(payload));
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: {
        'Authorization': await vapidAuthHeader(env, sub.endpoint),
        'Content-Encoding': 'aes128gcm',
        'Content-Type': 'application/octet-stream',
        'TTL': '43200',
        'Urgency': 'normal',
      },
      body,
    });
    if (res.status === 404 || res.status === 410) return 'gone';
    return res.ok ? 'ok' : 'error';
  } catch (e) { return 'error'; }
}

// ---------- local time for a phone ----------
function localNow(tz) {
  const d = new Date();
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const get = t => parts.find(p => p.type === t).value;
  const hour = Number(get('hour')) % 24;
  return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: hour * 60 + Number(get('minute')) };
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: corsHeaders() });
    if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'Invalid JSON body' }, 400); }

    // ---- reminders ----
    if (body.action === 'vapid') return json({ publicKey: env.VAPID_PUBLIC_KEY || null, enabled: !!(env.VAPID_PUBLIC_KEY && env.PEAK_PUSH) });
    if (body.action === 'subscribe') {
      if (!env.PEAK_PUSH) return json({ error: 'Reminders are not set up on the server' }, 503);
      const sub = body.subscription;
      if (!sub || !sub.endpoint || !sub.keys || !sub.keys.p256dh || !sub.keys.auth) return json({ error: 'Missing subscription' }, 400);
      const minutes = Number(body.minutes); const tz = String(body.tz || 'UTC');
      if (!(minutes >= 0 && minutes < 1440)) return json({ error: 'Bad time' }, 400);
      const key = await sha256hex(sub.endpoint);
      const existing = await env.PEAK_PUSH.get(key, 'json');
      const record = { sub, minutes, tz, plan: body.plan || (existing && existing.plan) || {}, name: body.name || '', lastSent: existing ? existing.lastSent : null, updatedAt: Date.now() };
      await env.PEAK_PUSH.put(key, JSON.stringify(record));
      return json({ ok: true });
    }
    if (body.action === 'unsubscribe') {
      if (!env.PEAK_PUSH) return json({ ok: true });
      if (body.endpoint) await env.PEAK_PUSH.delete(await sha256hex(body.endpoint));
      return json({ ok: true });
    }
    if (body.action === 'test') {
      // The phone asks for one immediate reminder, to prove the chain works end to end.
      if (!env.PEAK_PUSH) return json({ error: 'Reminders are not set up on the server' }, 503);
      const rec = body.endpoint ? await env.PEAK_PUSH.get(await sha256hex(body.endpoint), 'json') : null;
      if (!rec) return json({ error: 'Not registered' }, 404);
      const r = await sendPush(env, rec.sub, { title: 'Peak', body: 'Reminders are on. This is what a morning will look like.', url: './' });
      return json({ ok: r === 'ok', result: r });
    }

    // ---- Strava relay (unchanged) ----
    const params = new URLSearchParams({ client_id: env.STRAVA_CLIENT_ID, client_secret: env.STRAVA_CLIENT_SECRET });
    if (body.action === 'exchange' && body.code) { params.set('grant_type', 'authorization_code'); params.set('code', body.code); }
    else if (body.action === 'refresh' && body.refresh_token) { params.set('grant_type', 'refresh_token'); params.set('refresh_token', body.refresh_token); }
    else return json({ error: 'Unknown action' }, 400);
    const stravaRes = await fetch('https://www.strava.com/api/v3/oauth/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: params.toString() });
    const data = await stravaRes.json();
    if (!stravaRes.ok) return json({ error: 'Strava rejected the request', detail: data }, stravaRes.status);
    return json({ access_token: data.access_token, refresh_token: data.refresh_token, expires_at: data.expires_at });
  },

  // Every 15 minutes: each phone whose local time has passed its chosen minute today, and
  // has not been sent today, gets its line for the day. Dead subscriptions are removed.
  async scheduled(event, env, ctx) {
    if (!env.PEAK_PUSH) return;
    let cursor;
    do {
      const page = await env.PEAK_PUSH.list({ cursor, limit: 200 });
      for (const k of page.keys) {
        const rec = await env.PEAK_PUSH.get(k.name, 'json');
        if (!rec || !rec.sub) continue;
        let now; try { now = localNow(rec.tz || 'UTC'); } catch (e) { now = localNow('UTC'); }
        if (rec.lastSent === now.date) continue;
        const due = now.minutes >= rec.minutes && now.minutes - rec.minutes < SEND_WINDOW_MIN;
        if (!due) continue;
        const line = rec.plan && rec.plan.days ? rec.plan.days[now.date] : null;
        if (line) {
          const r = await sendPush(env, rec.sub, { title: rec.name ? `${rec.name}, today` : 'Today', body: line, url: './' });
          if (r === 'gone') { await env.PEAK_PUSH.delete(k.name); continue; }
        }
        rec.lastSent = now.date; // a day with nothing to say is still a day done
        await env.PEAK_PUSH.put(k.name, JSON.stringify(rec));
      }
      cursor = page.list_complete ? null : page.cursor;
    } while (cursor);
  },
};

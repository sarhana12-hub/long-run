// Peak — Strava OAuth relay
//
// This is NOT part of the static site and is not deployed by GitHub Pages.
// It runs separately as a Cloudflare Worker, whose only job is the one step
// Strava requires off the browser: exchanging a code (or refresh token) for
// an access token using the client_secret, which can never be safely shipped
// in the app's own JS.
//
// It is intentionally stateless — it never stores a token anywhere. It takes
// a request, calls Strava, and hands back exactly what it got, every time.
// The browser is responsible for keeping the tokens (in this app's case,
// alongside the rest of its data in localStorage).
//
// Deployed via the Cloudflare dashboard's own editor — no local build step,
// no dependencies. Needs two secrets set in the Worker's settings:
//   STRAVA_CLIENT_ID
//   STRAVA_CLIENT_SECRET

const ALLOWED_ORIGIN = 'https://sarhana12-hub.github.io';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
}

function json(data, status) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { ...corsHeaders(), 'Content-Type': 'application/json' },
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders() });
    }
    if (request.method !== 'POST') {
      return json({ error: 'Method not allowed' }, 405);
    }

    let body;
    try {
      body = await request.json();
    } catch (e) {
      return json({ error: 'Invalid JSON body' }, 400);
    }

    const params = new URLSearchParams({
      client_id: env.STRAVA_CLIENT_ID,
      client_secret: env.STRAVA_CLIENT_SECRET,
    });

    if (body.action === 'exchange' && body.code) {
      params.set('grant_type', 'authorization_code');
      params.set('code', body.code);
    } else if (body.action === 'refresh' && body.refresh_token) {
      params.set('grant_type', 'refresh_token');
      params.set('refresh_token', body.refresh_token);
    } else {
      return json({ error: 'Expected {action:"exchange", code} or {action:"refresh", refresh_token}' }, 400);
    }

    const stravaRes = await fetch('https://www.strava.com/api/v3/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params.toString(),
    });
    const data = await stravaRes.json();

    if (!stravaRes.ok) {
      return json({ error: 'Strava rejected the request', detail: data }, stravaRes.status);
    }

    // Pass through only what the app needs to keep — never log this anywhere.
    return json({
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      expires_at: data.expires_at,
    });
  },
};

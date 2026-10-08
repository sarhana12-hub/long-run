# Morning reminders: one-time setup on Cloudflare

Reminders are sent by the same Worker that relays Strava sign-in. Runners do nothing beyond
tapping "Turn on reminders" in the app and accepting the iPhone prompt. This page is the
one-time setup on our side. Allow about half an hour.

The keys are in `VAPID-KEYS.local.txt` next to this file. That file is ignored by git and
must never be committed or pasted anywhere but the Worker's secrets.

## 1. Open the Worker

Cloudflare dashboard → Workers & Pages → `peakstravarelay`.

## 2. Add the key-value store

The namespace has to exist before the Worker can be bound to it, and the binding dialog cannot create one.

1. Left sidebar → Storage & Databases → KV → Create a namespace → name it `PEAK_PUSH` → Create.
2. Back in the Worker: Settings → Bindings → Add → KV namespace.
   - Variable name: `PEAK_PUSH`
   - KV namespace: pick `PEAK_PUSH` from the list (leave "Use production value" ticked) → Add Binding.

## 3. Add the three secrets

Settings → Variables and Secrets → Add, three times, each with type **Secret**, copying the
values from `VAPID-KEYS.local.txt`:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`: the whole value including the prefix, `mailto:you@example.com` (the Worker adds `mailto:` if it is missing, but paste it anyway)

The two Strava secrets already there stay as they are.

## 4. Add the schedule

Settings → Triggers → Cron Triggers → Add → enter `*/15 * * * *` → Save.

## 5. Replace the code

Edit code → select everything in the editor → paste the whole of `worker.js` from this
folder → Deploy.

## 6. Check it

In the app: Settings → Reminders → Turn on reminders → accept the prompt → Send a test.
A notification should arrive within a few seconds. If "Reminders are not set up on the
server" appears, step 2 or 3 is incomplete.

## How it works, for reference

- The phone sends the Worker its push subscription, the local times it chose (a morning one for today's workout, an evening one previewing tomorrow, either or both), its timezone,
  and a summary of the plan: one line per day (workout, distance, strength). It re-sends the
  summary whenever the plan changes.
- Every 15 minutes the Worker looks at each phone's local time and sends the day's line once
  the morning time has passed and tomorrow's line once the evening time has passed, each at
  most once a day. Rest days with no strength send nothing.
- Nothing else is stored: no name beyond what the runner chose to show, no logs, no account.
- Turning reminders off deletes the phone's record.
- iPhone needs iOS 16.4 or later and the app installed on the home screen with
  "Open as Web App" on. If the runner declines the prompt, reminders can only be re-enabled
  from the phone's own Settings → Notifications → Peak.

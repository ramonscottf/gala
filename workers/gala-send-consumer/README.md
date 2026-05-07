# gala-send-consumer

Queue consumer that processes the `gala-marketing-send` queue.

## Why

The original Pages Function `marketing-send-now.js` did sequential sends
inside a single HTTP request. When the browser disconnected at ~30s,
Cloudflare's runtime cancelled the entire request including any in-flight
work. On 2026-05-07 a send to 91 recipients stopped at 78.

The fix is to split producer and consumer:

- **Producer** (`marketing-send-queued.js`): enqueues N messages, returns runId
- **Consumer** (this worker): drains queue independently, no HTTP timeout

## Deploy

```bash
cd workers/gala-send-consumer
wrangler secret put MAIL_TOKEN  # paste SkippyMail bearer token
wrangler deploy
```

## Settings

- `batch_size: 10` — process 10 messages per invocation
- `max_concurrency: 4` — up to 4 parallel batches = 40 sends/sec sustained
- `max_retries: 3` — transient failures retried 3x before DLQ
- `retry_delay: 30s` — wait 30s between retries
- `dead_letter_queue: gala-marketing-send-dlq` — persistent failures land here

## Message format

```json
{
  "sendId": "s1a",
  "runId": "uuid",
  "recipient": {
    "id": 89,
    "email": "scott@wickowaypoint.com",
    "first_name": "Scott",
    "last_name": null,
    "company": "Wicko Waypoint"
  },
  "sendRow": {
    "send_id": "s1a",
    "audience": "Confirmed Buyers",
    "subject": "...",
    "body": "<p>...</p>"
  }
}
```

## Logging

Every processed message writes one row to `marketing_send_log` with
`sent_by='queue-consumer'`. Successes have `status='sent'`; permanent
4xx failures have `status='failed'` with the error in `error_message`.
Transient failures (5xx, network) throw and trigger queue retries —
they only get logged after they succeed or land in DLQ.

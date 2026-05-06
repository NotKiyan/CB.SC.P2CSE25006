# Stage 1

## Campus Notifications Microservice - REST API Design

This stage defines backend API contracts for a campus notification platform that supports Placements, Events, and Results updates, plus a real-time delivery mechanism.

---

## 1) Core Actions Supported

1. Create a notification (admin/system initiated)
2. List notifications for a logged-in user (with filters + pagination)
3. Get a single notification by ID
4. Mark one notification as read
5. Mark all notifications as read
6. Delete/archive a notification for a user
7. Manage user notification preferences
8. Publish real-time notifications to active clients

---

## 2) Base API Conventions

- Base URL: `/api/v1`
- Content type: `application/json`
- Date format: ISO-8601 (`2026-05-06T15:04:05Z`)
- Id format: UUID string
- Auth assumption (as per test constraint): requests are pre-authorized by upstream systems.

---

## 3) Common Headers

### Request Headers

```http
Content-Type: application/json
Accept: application/json
X-Request-Id: <uuid>
X-User-Id: <uuid>
X-User-Role: student|admin
```

### Response Headers

```http
Content-Type: application/json
X-Request-Id: <uuid>
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
```

For paginated list endpoints:

```http
X-Total-Count: <number>
Link: <next-page-link-if-available>
```

---

## 4) Data Models (JSON Schemas)

### Notification Object

```json
{
  "id": "f2aa9aa3-96fc-4ab6-b0dc-b2dc0f9f09a2",
  "type": "placement",
  "title": "Placement drive: ABC Corp",
  "message": "Registration closes on 10 May, 5 PM",
  "priority": "high",
  "audience": {
    "mode": "segment",
    "departments": ["CSE"],
    "years": [2026]
  },
  "metadata": {
    "eventDate": "2026-05-10",
    "ctaLabel": "Register",
    "ctaUrl": "https://placements.example.edu/drives/abc"
  },
  "status": "published",
  "createdBy": "system",
  "createdAt": "2026-05-06T10:30:00Z",
  "updatedAt": "2026-05-06T10:30:00Z"
}
```

### UserNotification State Object

```json
{
  "userId": "d4bce75b-05b2-43a1-9d9b-bf0f0898fcb9",
  "notificationId": "f2aa9aa3-96fc-4ab6-b0dc-b2dc0f9f09a2",
  "isRead": false,
  "readAt": null,
  "isArchived": false,
  "deliveredChannels": ["in_app", "websocket"],
  "deliveredAt": "2026-05-06T10:30:01Z"
}
```

### Preferences Object

```json
{
  "userId": "d4bce75b-05b2-43a1-9d9b-bf0f0898fcb9",
  "channels": {
    "inApp": true,
    "email": true,
    "sms": false
  },
  "types": {
    "placement": true,
    "event": true,
    "result": true,
    "general": true
  },
  "quietHours": {
    "enabled": false,
    "start": "22:00",
    "end": "07:00",
    "timezone": "Asia/Kolkata"
  },
  "updatedAt": "2026-05-06T10:30:00Z"
}
```
---

## 5) Endpoint Contracts

## 5.1 Create Notification

`POST /api/v1/notifications`

---

## 5.2 List Notifications for User

`GET /api/v1/notifications?type=placement&isRead=false&page=1&limit=20`

### Success Response (200)

---

## 5.3 Get Notification by Id

`GET /api/v1/notifications/{notificationId}`

---

## 5.4 Mark Single Notification as Read

`PATCH /api/v1/notifications/{notificationId}/read`

### Request Body

```json
{
  "isRead": true
}
```

---

## 5.5 Mark All as Read

`PATCH /api/v1/notifications/read-all`

### Request Body

```json
{
  "type": "all"
}
```
---

## 5.6 Archive/Delete Notification for User

`DELETE /api/v1/notifications/{notificationId}`

### Success Response (200)

```json
{
  "message": "Notification archived for user"
}
```

---

## 5.7 Get Preferences

`GET /api/v1/users/me/notification-preferences`

---

## 5.8 Update Preferences

`PUT /api/v1/users/me/notification-preferences`

### Request Body

```json
{
  "channels": {
    "inApp": true,
    "email": false,
    "sms": false
  },
  "types": {
    "placement": true,
    "event": true,
    "result": true,
    "general": false
  },
  "quietHours": {
    "enabled": true,
    "start": "23:00",
    "end": "06:00",
    "timezone": "Asia/Kolkata"
  }
}
```
---

## 6) Error Response Contract

All endpoints return this structure on error:

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "type must be one of placement,event,result,general",
    "details": [
      {
        "field": "type",
        "issue": "invalid value"
      }
    ]
  }
}
```

Suggested error codes:

- `VALIDATION_ERROR` (400)
- `UNAUTHORIZED` (401, only if upstream auth fails)
- `FORBIDDEN` (403)
- `NOT_FOUND` (404)
- `CONFLICT` (409)
- `RATE_LIMITED` (429)
- `INTERNAL_ERROR` (500)

---

## 7) Real-Time Notification Mechanism

Use WebSocket for live in-app updates.

### WebSocket Endpoint

`GET /api/v1/realtime/notifications/ws`

### Handshake Headers

```http
Upgrade: websocket
Connection: Upgrade
X-User-Id: <uuid>
X-Request-Id: <uuid>
```

### Server-to-Client Event Format

```json
{
  "event": "notification.created",
  "timestamp": "2026-05-06T10:30:01Z",
  "data": {
    "id": "f2aa9aa3-96fc-4ab6-b0dc-b2dc0f9f09a2",
    "type": "placement",
    "title": "Placement drive: ABC Corp",
    "message": "Registration closes on 10 May, 5 PM",
    "priority": "high"
  }
}
```
---

# Stage 2

## 1) Suggested Persistent Storage

I suggest **PostgreSQL** as the primary database.

Why this fits the Stage 1 APIs:
- Notification and user-read states are relational and query-heavy (filter by user, type, read status, time).
- We need strong consistency for actions like mark-read, mark-all-read, archive, and preference updates.
- PostgreSQL supports JSONB for flexible `metadata` and `audience` fields without losing SQL power.
- Mature indexing and partitioning features help as data volume grows.

---

## 2) Applicable DB Schema (SQL)

```sql
CREATE TYPE notification_type AS ENUM ('placement', 'event', 'result', 'general');
CREATE TYPE priority_type AS ENUM ('low', 'medium', 'high');
CREATE TYPE notification_status AS ENUM ('draft', 'published', 'cancelled');

CREATE TABLE notifications (
  id UUID PRIMARY KEY,
  type notification_type NOT NULL,
  title VARCHAR(160) NOT NULL,
  message TEXT NOT NULL,
  priority priority_type NOT NULL DEFAULT 'medium',
  audience JSONB NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  status notification_status NOT NULL DEFAULT 'published',
  created_by VARCHAR(80) NOT NULL,
  publish_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE user_notifications (
  user_id UUID NOT NULL,
  notification_id UUID NOT NULL REFERENCES notifications(id) ON DELETE CASCADE,
  is_read BOOLEAN NOT NULL DEFAULT FALSE,
  read_at TIMESTAMPTZ,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  delivered_channels TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, notification_id)
);

CREATE TABLE notification_preferences (
  user_id UUID PRIMARY KEY,
  channels JSONB NOT NULL,
  types JSONB NOT NULL,
  quiet_hours JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

### Recommended Indexes

```sql
CREATE INDEX idx_notifications_created_at ON notifications (created_at DESC);
CREATE INDEX idx_notifications_type_status_created ON notifications (type, status, created_at DESC);

CREATE INDEX idx_user_notifications_user_unread_created
  ON user_notifications (user_id, is_read, is_archived, created_at DESC);

CREATE INDEX idx_user_notifications_user_notification
  ON user_notifications (user_id, notification_id);

CREATE INDEX idx_notifications_audience_gin ON notifications USING GIN (audience);
CREATE INDEX idx_notifications_metadata_gin ON notifications USING GIN (metadata);
```

---

## 3) Scale Problems as Data Grows and Solutions

### Problem A: Very large `user_notifications` table
- Cause: one notification can fan out to many users.
- Solution:
  - Partition `user_notifications` by month (`created_at`) or hash (`user_id`) based on traffic pattern.
  - Add retention policy (archive/purge rows older than policy window).

### Problem B: Slow list APIs (`GET /notifications`) at high volume
- Cause: deep offset pagination + mixed filters.
- Solution:
  - Use keyset pagination (`created_at`, `notification_id`) instead of large offsets.
  - Keep covering indexes for most common filter combinations.

### Problem C: Write spikes during bulk publish
- Cause: high fan-out inserts to `user_notifications`.
- Solution:
  - Batch inserts.
  - Use async worker queue for fan-out.
  - Keep transaction size controlled (chunk users).

### Problem D: Heavy JSON filter queries
- Cause: unindexed JSONB access patterns.
- Solution:
  - GIN indexes on JSONB columns.
  - Promote frequently filtered JSON keys into typed columns when patterns stabilize.

### Problem E: Real-time + API consistency gaps
- Cause: websocket push may happen before durable write confirmation.
- Solution:
  - Write first to DB, then publish event from an outbox/queue worker.
  - Retry failed pushes and rely on list API for eventual sync.

---

## 4) SQL Queries Mapped to APIs

### 4.1 Create Notification (`POST /notifications`)

```sql
INSERT INTO notifications (
  id, type, title, message, priority, audience, metadata, status, created_by, publish_at
)
VALUES (
  $1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, 'published', $8, $9
)
RETURNING id, status, created_at;
```

### 4.2 Fan-out to target users (background step)

```sql
INSERT INTO user_notifications (user_id, notification_id, delivered_channels, delivered_at)
SELECT u.user_id, $1, ARRAY['in_app']::text[], NOW()
FROM target_users u
ON CONFLICT (user_id, notification_id) DO NOTHING;
```

### 4.3 List Notifications (`GET /notifications`)

```sql
SELECT
  n.id, n.type, n.title, n.message, n.priority,
  un.is_read, n.created_at
FROM user_notifications un
JOIN notifications n ON n.id = un.notification_id
WHERE un.user_id = $1
  AND un.is_archived = FALSE
  AND ($2::notification_type IS NULL OR n.type = $2)
  AND ($3::boolean IS NULL OR un.is_read = $3)
  AND n.status = 'published'
ORDER BY n.created_at DESC, n.id DESC
LIMIT $4 OFFSET $5;
```

### 4.4 Get by Id (`GET /notifications/{id}`)

```sql
SELECT
  n.id, n.type, n.title, n.message, n.priority, n.metadata,
  un.is_read, n.created_at
FROM user_notifications un
JOIN notifications n ON n.id = un.notification_id
WHERE un.user_id = $1
  AND n.id = $2
  AND un.is_archived = FALSE
LIMIT 1;
```

### 4.5 Mark one as read (`PATCH /notifications/{id}/read`)

```sql
UPDATE user_notifications
SET is_read = TRUE,
    read_at = NOW(),
    updated_at = NOW()
WHERE user_id = $1
  AND notification_id = $2
  AND is_archived = FALSE
RETURNING user_id, notification_id, is_read, read_at;
```

### 4.6 Mark all as read (`PATCH /notifications/read-all`)

```sql
UPDATE user_notifications un
SET is_read = TRUE,
    read_at = NOW(),
    updated_at = NOW()
FROM notifications n
WHERE un.notification_id = n.id
  AND un.user_id = $1
  AND un.is_archived = FALSE
  AND un.is_read = FALSE
  AND ($2::notification_type IS NULL OR n.type = $2)
RETURNING un.notification_id;
```

### 4.7 Archive/Delete for user (`DELETE /notifications/{id}` as soft delete)

```sql
UPDATE user_notifications
SET is_archived = TRUE,
    updated_at = NOW()
WHERE user_id = $1
  AND notification_id = $2
RETURNING user_id, notification_id, is_archived;
```

### 4.8 Get preferences (`GET /users/me/notification-preferences`)

```sql
SELECT user_id, channels, types, quiet_hours, updated_at
FROM notification_preferences
WHERE user_id = $1;
```

### 4.9 Update preferences (`PUT /users/me/notification-preferences`)

```sql
INSERT INTO notification_preferences (user_id, channels, types, quiet_hours, updated_at)
VALUES ($1, $2::jsonb, $3::jsonb, $4::jsonb, NOW())
ON CONFLICT (user_id)
DO UPDATE SET
  channels = EXCLUDED.channels,
  types = EXCLUDED.types,
  quiet_hours = EXCLUDED.quiet_hours,
  updated_at = NOW()
RETURNING user_id, updated_at;
```

---

# Stage 3

## Query Given

```sql
SELECT *
FROM notifications
WHERE studentID = 1042 AND isRead = false
ORDER BY createdAt DESC;
```

## 1) Is this query accurate?

Partially accurate.

- If your table is denormalized (one row per student-notification), it can return unread rows for one student.
- For the Stage 1/Stage 2 design (`notifications` + `user_notifications`), this query is not accurate because unread state belongs in `user_notifications`, not in `notifications`.
- It also misses practical filters like `is_archived = false`, `status = 'published'`, and pagination.

## 2) Why is this slow?

At 5,000,000 rows, this can be slow due to:

- No composite index matching both filter and sort.
- `SELECT *` forces wider row reads.
- Sorting can become expensive if rows are not already in index order.
- Returning very large unread sets without `LIMIT` increases I/O and memory cost.

## 3) What should be changed?

### A) Query shape

Use projected columns and pagination:

```sql
SELECT id, notificationType, title, message, createdAt
FROM notifications
WHERE studentID = $1
  AND isRead = false
ORDER BY createdAt DESC
LIMIT 50;
```

### B) Index strategy

For PostgreSQL (best with partial index on unread rows):

```sql
CREATE INDEX CONCURRENTLY idx_notifications_student_unread_created
ON notifications (studentID, createdAt DESC)
WHERE isRead = false;
```

For MySQL (no partial index, use composite index):

```sql
CREATE INDEX idx_notifications_student_read_created
ON notifications (studentID, isRead, createdAt DESC);
```

### C) Likely computation cost

- Without proper index: close to full scan + sort behavior (`O(N)` scan, often `O(M log M)` sort on matched rows).
- With proper composite index: index seek + ordered range scan (`O(log N + K)`), where `K` is returned rows.

## 4) Should we add indexes on every column?

No. That advice is not effective.

- Every extra index slows `INSERT/UPDATE/DELETE` (write amplification).
- Indexes consume RAM and disk.
- Single-column indexes often do not help multi-condition + sorted queries as much as one correct composite index.
- You should index based on real query patterns, not "every column just in case".

## 5) Query: students who got Placement notifications in last 7 days

### If using the prompt's single-table model (`notificationType` enum with `Placement`)

```sql
SELECT DISTINCT studentID
FROM notifications
WHERE notificationType = 'Placement'
  AND createdAt >= NOW() - INTERVAL '7 days';
```

### If using Stage 1/2 normalized schema (`notifications` + `user_notifications`)

```sql
SELECT DISTINCT un.user_id AS student_id
FROM user_notifications un
JOIN notifications n ON n.id = un.notification_id
WHERE n.type = 'placement'
  AND n.created_at >= NOW() - INTERVAL '7 days'
  AND un.is_archived = false;
```

## 6) Extra optimization note for scale

As data grows further, use keyset pagination instead of deep offsets for notification timelines.

# Stage 4

Fetching notifications from DB on every page load for every student creates repeated hot reads, high DB CPU, and high query latency.

## Proposed Solution

Use a layered approach instead of only scaling the database vertically.

### 1) Cache-first timeline reads

- Keep a per-user notification feed cache in Redis (for example: `notif:feed:{userId}`).
- API read flow:
  1. Try Redis first.
  2. If miss, fetch from DB, hydrate cache with short TTL, return response.
- Invalidate/update cache when notification state changes (new notification, read, archive, mark-all-read).

**Tradeoff:**
- Pros: major DB offload, faster p95 latency.
- Cons: cache invalidation complexity, possible temporary staleness.

### 2) Push model using WebSocket/SSE

- Do not rely only on page-load polling.
- After initial fetch, deliver new notifications in real time via WebSocket (`notification.created`, `notification.read.updated`).
- Client updates local state incrementally.

**Tradeoff:**
- Pros: fewer repeated API hits, better UX (real-time).
- Cons: connection management overhead, need reconnect/heartbeat logic.

### 3) Query/index optimization in DB

- Keep unread and timeline queries on optimized indexes.
- For normalized design from Stage 2:

```sql
CREATE INDEX idx_un_user_arch_read_created
ON user_notifications (user_id, is_archived, is_read, created_at DESC);

CREATE INDEX idx_n_status_type_created
ON notifications (status, type, created_at DESC);
```

**Tradeoff:**
- Pros: lower query latency without architecture change.
- Cons: more indexes increase write cost and storage.

### 4) Precomputed counters and fan-out workers

- Maintain `unread_count` per user in Redis or a compact table.
- Use background workers/queue for heavy fan-out writes and cache refresh.

**Tradeoff:**
- Pros: quick badge/count API, smoother write spikes.
- Cons: eventual consistency window; operational complexity.




# Stage 5

## Shortcomings in the Proposed `notify_all`

Given pseudocode:

```text
for each student:
  send_email
  save_to_db
  push_to_app
```

Main issues:

1. **Sequential and slow**: 50,000 users x network calls in a loop leads to very high total latency.
2. **No fault isolation**: if email fails midway (for 200 students), flow becomes partially completed and hard to recover.
3. **No idempotency**: retries can send duplicate emails/notifications.
4. **No delivery state tracking**: cannot answer who got email, who got in-app, and who needs retry.
5. **Tight coupling**: DB write and external email API call in the same synchronous path reduces reliability.
6. **No backpressure/rate control**: email provider limits can cause burst failures.

---

## What to Do When Email Failed for 200 Students Midway

Do **not** restart the whole broadcast. Retry only failed recipients.

- Maintain per-recipient delivery status (`pending`, `sent`, `failed`, `retrying`, `dead_letter`).
- Use retry with exponential backoff + max attempts.
- Keep idempotency key: `(campaign_id, student_id, channel)`.
- Move exhausted failures to DLQ for manual/automated replay.

---

## Should DB save and email sending happen together?

Not as one distributed transaction.

- DB and Email API are separate systems; a single ACID transaction across both is not practical.
- If you "send email first then DB fails", delivery is untracked.
- If you "DB first then email fails", you can safely retry from persisted state.

Correct pattern: **Transactional Outbox + Async Workers**.

1. In one DB transaction, persist notification and outbox events.
2. Commit transaction.
3. Workers read outbox and send email / push in parallel.
4. Update delivery status and retry failures safely.

---

## Reliable and Fast Redesign

### High-level flow

1. Create `campaign` record.
2. Insert in-app notification records for recipients (batched).
3. Insert channel jobs into outbox (`email`, `in_app`).
4. Background workers process outbox concurrently.
5. Real-time channel pushes in-app updates via WebSocket from worker events.
6. API returns quickly with `campaign_id` and accepted count.

### Data entities to track

- `notification_campaigns`
- `user_notifications`
- `notification_deliveries` (per user, per channel status)
- `outbox_events`

---

## Revised Pseudocode

```python
def notify_all(student_ids: list[str], message: str, actor_id: str) -> dict:
    campaign_id = uuid4()

    # 1) Durable write first (single DB transaction)
    with db.transaction():
        db.insert("notification_campaigns", {
            "campaign_id": campaign_id,
            "message": message,
            "created_by": actor_id,
            "status": "accepted"
        })

        # batched inserts for scale
        for batch in chunk(student_ids, 1000):
            db.bulk_insert("user_notifications", [
                {
                    "campaign_id": campaign_id,
                    "student_id": sid,
                    "message": message,
                    "is_read": False,
                    "is_archived": False
                }
                for sid in batch
            ])

            db.bulk_insert("notification_deliveries", [
                {
                    "campaign_id": campaign_id,
                    "student_id": sid,
                    "channel": "email",
                    "status": "pending",
                    "attempt_count": 0
                }
                for sid in batch
            ] + [
                {
                    "campaign_id": campaign_id,
                    "student_id": sid,
                    "channel": "in_app",
                    "status": "pending",
                    "attempt_count": 0
                }
                for sid in batch
            ])

            db.bulk_insert("outbox_events", [
                {
                    "event_type": "SEND_EMAIL",
                    "idempotency_key": f"{campaign_id}:{sid}:email",
                    "payload": {"campaign_id": campaign_id, "student_id": sid, "message": message}
                }
                for sid in batch
            ] + [
                {
                    "event_type": "PUSH_IN_APP",
                    "idempotency_key": f"{campaign_id}:{sid}:in_app",
                    "payload": {"campaign_id": campaign_id, "student_id": sid, "message": message}
                }
                for sid in batch
            ])

    # 2) Return fast; async workers do actual delivery
    return {
        "campaign_id": str(campaign_id),
        "accepted_recipients": len(student_ids),
        "status": "processing"
    }


def worker_process_outbox(event):
    # idempotency check
    if already_processed(event.idempotency_key):
        mark_outbox_done(event)
        return

    try:
        if event.event_type == "SEND_EMAIL":
            email_provider.send(event.payload["student_id"], event.payload["message"])
            mark_delivery_sent(event.payload["campaign_id"], event.payload["student_id"], "email")

        elif event.event_type == "PUSH_IN_APP":
            websocket_hub.push(event.payload["student_id"], {
                "event": "notification.created",
                "message": event.payload["message"],
                "campaign_id": event.payload["campaign_id"]
            })
            mark_delivery_sent(event.payload["campaign_id"], event.payload["student_id"], "in_app")

        mark_processed(event.idempotency_key)
        mark_outbox_done(event)

    except TemporaryError:
        schedule_retry(event, backoff="exponential", max_attempts=5)
        mark_delivery_retrying(event)

    except Exception:
        mark_delivery_failed(event)
        send_to_dlq(event)
```

---





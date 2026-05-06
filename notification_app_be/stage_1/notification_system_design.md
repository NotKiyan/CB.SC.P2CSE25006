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


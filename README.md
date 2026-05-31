# Mini Lead CRM API

A RESTful API for a simplified Lead Management CRM built for Superleap's backend intern assessment.

---

## Tech Stack

| Layer | Choice | Why |
|-------|--------|-----|
| **Runtime** | Node.js + Express | Lightweight, fast to iterate, great ecosystem for REST APIs. Express gives full control without too much magic. |
| **Database** | MongoDB (via Mongoose) | Leads are document-like objects with optional fields — MongoDB fits naturally. Mongoose adds schema validation and clean ODM syntax. |
| **Cache** | Redis (with in-memory fallback) | Redis is the industry standard for fast key-value caching. The in-memory fallback means the app works even without Redis — no hard dependency. |

---

## Setup & Running Locally

### Option 1 — Docker (recommended, zero setup)

```bash
git clone https://github.com/iam-spoorthy/Lead_CRM_Backend.git
cd lead-crm

# Start everything (app + MongoDB + Redis)
docker compose up --build
```

App will be available at `http://localhost:3000`

### Option 2 — Manual (Node + local MongoDB/Redis)

**Prerequisites:** Node.js 18+, MongoDB running locally, Redis (optional)
 
```bash
git clone <your-repo-url>
cd lead-crm

npm install

npm run dev       # development with auto-reload
# OR
npm start         # production
```

### Seed sample data

```bash
npm run seed
```

This inserts 7 sample leads across all statuses.

---

## API Documentation

### Base URL
```
http://localhost:3000
```

### Endpoints

---

#### `POST /leads` — Create a lead

```http
POST /leads
Content-Type: application/json

{
  "name": "Aman Gupta",
  "email": "aman@example.com",
  "phone": "+91-9876543210",
  "source": "website"
}
```

**Response 201:**
```json
{
  "id": "a1b2c3d4...",
  "name": "Aman Gupta",
  "email": "aman@example.com",
  "phone": "+91-9876543210",
  "status": "NEW",
  "source": "website",
  "created_at": "2026-04-27T10:00:00.000Z",
  "updated_at": "2026-04-27T10:00:00.000Z"
}
```

---

#### `GET /leads` — List all leads

Supports query params:

| Param | Type | Description |
|-------|------|-------------|
| `status` | string | Filter by status (NEW, CONTACTED, etc.) |
| `source` | string | Filter by source |
| `name` | string | Search by name (case-insensitive partial match) |
| `page` | number | Page number (default: 1) |
| `limit` | number | Results per page (default: 20, max: 100) |
| `sortBy` | string | Field to sort by (default: created_at) |
| `order` | string | `asc` or `desc` (default: desc) |

```http
GET /leads?status=NEW&page=1&limit=10
```

**Response 200:**
```json
{
  "total": 42,
  "page": 1,
  "limit": 10,
  "data": [ ... ]
}
```

---

#### `GET /leads/:id` — Get a single lead

```http
GET /leads/a1b2c3d4
```

**Response 200:** Lead object (served from cache if available)

**Response 404:**
```json
{ "error": "Lead not found" }
```

---

#### `PUT /leads/:id` — Update lead fields

Note: `status` cannot be changed via this endpoint — use `PATCH /:id/status`.

```http
PUT /leads/a1b2c3d4
Content-Type: application/json

{
  "phone": "+91-9000000000",
  "source": "referral"
}
```

**Response 200:** Updated lead object

---

#### `DELETE /leads/:id` — Delete a lead

```http
DELETE /leads/a1b2c3d4
```

**Response 200:**
```json
{ "message": "Lead deleted successfully", "id": "a1b2c3d4" }
```

---

#### `PATCH /leads/:id/status` — Transition status

```http
PATCH /leads/a1b2c3d4/status
Content-Type: application/json

{ "status": "CONTACTED" }
```

**Valid transitions:**
```
NEW → CONTACTED → QUALIFIED → CONVERTED
 ↘ LOST          ↘ LOST       ↘ LOST
```
`CONVERTED` and `LOST` are terminal — no further transitions allowed.

**Response 200:** Updated lead object

**Response 400 (invalid transition):**
```json
{ "error": "Invalid status transition from NEW to CONVERTED" }
```

---

#### `POST /leads/bulk` — Bulk create leads

```http
POST /leads/bulk
Content-Type: application/json

[
  { "name": "Lead A", "email": "a@example.com", "source": "website" },
  { "name": "Lead B", "email": "b@example.com" },
  { "name": "Bad Lead", "email": "not-an-email" }
]
```

**Response 207:**
```json
{
  "total": 3,
  "successful": 2,
  "failed": 1,
  "results": [
    { "index": 0, "success": true, "lead": { "id": "x1", "name": "Lead A", "..." : "..." } },
    { "index": 1, "success": true, "lead": { "id": "x2", "name": "Lead B", "..." : "..." } },
    { "index": 2, "success": false, "error": "email must be a valid email address" }
  ]
}
```

---

#### `PUT /leads/bulk` — Bulk update leads

```http
PUT /leads/bulk
Content-Type: application/json

[
  { "id": "x1", "phone": "+91-9999999999" },
  { "id": "x2", "source": "campaign" }
]
```

**Response 207:** Same partial-success format as bulk create.

---

## Design Decisions

### Status State Machine
Status transitions are enforced in two places: the `isValidTransition` static method on the Lead model (single source of truth), and checked in the controller before saving. This keeps business logic in the model layer, not scattered across routes.

### Cache Strategy (Level 3)
- **What's cached:** Individual lead objects at `GET /leads/:id`, keyed as `lead:{id}` with a 60-second TTL.
- **Why not `GET /leads`?** List responses vary by many filter/sort/page params — caching every combination would be memory-heavy and complex to invalidate. Single-lead fetches are the common hot path (e.g., opening a lead detail view).
- **Invalidation:** On every `PUT`, `DELETE`, and `PATCH /status`, the cache entry for that lead is deleted. This is a **write-through invalidation** (delete-on-write) strategy — simple and correct.
- **Fallback:** If Redis is unavailable at startup or disconnects mid-run, the app automatically falls back to a `Map`-based in-memory store. This means the app never crashes due to Redis being down.

### Bulk Operations
Bulk requests use `Promise.all` for concurrent processing — each record is attempted independently. A failure in one record does **not** roll back others. The response uses HTTP 207 (Multi-Status) to indicate partial success. Batch size is capped at 100 to prevent memory abuse.

### What I'd Do Differently at Scale
1. **Bulk ops with DB transactions** — For financial/critical data, wrap bulk inserts in MongoDB sessions for atomicity.
2. **Queue-based status transitions** — To handle concurrent `PATCH /status` requests on the same lead, use optimistic locking (`__v`) or a job queue to serialize transitions.
3. **Cache `GET /leads` with a short TTL** — At scale, even a 5-second cache on list endpoints dramatically reduces DB load.
4. **Pagination cursors** — Replace page/limit with cursor-based pagination for large datasets.
5. **Rate limiting** — Add `express-rate-limit` on bulk endpoints to prevent abuse.

### Concurrent Status Transition Problem
If two requests try to transition the same lead simultaneously (e.g., both read `NEW`, both try to write `CONTACTED`), MongoDB's last-write-wins could cause issues for multi-step transitions. Solution: use **optimistic concurrency** — include a `version` field and reject updates where the version has changed since the read.

---

## Health Check

```http
GET /health
→ { "status": "ok", "timestamp": "..." }
```

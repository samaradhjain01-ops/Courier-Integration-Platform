# Multi-Courier Integration Platform

A courier-agnostic REST API built with Node.js, TypeScript, Express, Prisma and SQLite. Consumers submit one normalized shipment contract and select a carrier with `courier_partner`. UrbaneBolt is the first external integration; MockCourier is included for local development and automated tests.

## Requirements

- Node.js 20.19+ (Node 22 LTS recommended)
- npm 10+

SQLite is used for a zero-service local setup. No Redis or separate database server is required for this assignment.

## Setup

```bash
npm install
cp .env.example .env
# Windows PowerShell: Copy-Item .env.example .env
npm run db:generate
npm run db:push
npm run dev
```

The API listens on `http://localhost:3000` by default. Prisma creates the SQLite database using `DATABASE_URL`.

For a production build:

```bash
npm run typecheck
npm test
npm run build
npm start
```

Do not commit `.env`, credentials, database files, or real customer data.

## Environment variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP port |
| `DATABASE_URL` | `file:./dev.db` | Prisma SQLite connection |
| `LOG_LEVEL` | `info` | Pino log level |
| `URBANEBOLT_BASE_URL` | `https://uat.urbanebolt.in` | UrbaneBolt UAT base URL |
| `URBANEBOLT_USERNAME` | empty | UrbaneBolt API username |
| `URBANEBOLT_PASSWORD` | empty | UrbaneBolt API password |
| `URBANEBOLT_CUSTOMER_CODE` | empty | Account/customer code supplied by UrbaneBolt |
| `URBANEBOLT_SERVICE_TYPE` | `SDD` | Manifest service type, e.g. `SDD` or `NDD` as enabled for the account |
| `URBANEBOLT_TIMEOUT_MS` | `15000` | Courier request timeout |
| `URBANEBOLT_RETRY_COUNT` | `2` | Transient courier retry count, excluding the one auth refresh retry |
| `RETRY_BASE_DELAY_MS` | `300` | Exponential retry base delay in milliseconds |
| `JOB_POLL_INTERVAL_MS` | `1000` | Bulk worker polling interval |
| `JOB_CONCURRENCY` | `5` | Maximum jobs processed concurrently per application process (max 20) |
| `JOB_STALE_AFTER_MS` | `300000` | Processing lease after which an abandoned job can be reclaimed |
| `MOCK_COURIER_USERNAME` | `mock-user` | Local mock adapter setting |
| `MOCK_COURIER_PASSWORD` | `mock-password` | Local mock adapter setting |

UrbaneBolt credentials and `customerCode` must be obtained from its integration team. No production credentials are included. The [UrbaneBolt UAT Postman documentation](https://documenter.getpostman.com/view/19172174/2sAYHzFhxb) does not publish token lifetime or stable response examples, so verify the response field mapping with your assigned UAT account before production use.

## API

All endpoints are prefixed with `/api/v1`. Every error uses this envelope:

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Request validation failed",
    "details": { "fields": [{ "field": "courier_partner", "message": "Required" }] }
  },
  "requestId": "correlation-id"
}
```

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Liveness check |
| GET | `/couriers` | Registered courier identifiers |
| POST | `/orders` | Create one shipment |
| GET | `/orders/:orderId` | Read order and tracking history |
| GET | `/orders/:orderId/track` | Refresh tracking and append a history event |
| POST | `/orders/:orderId/cancel` | Cancel using the stored AWB |
| POST | `/orders/bulk` | Enqueue up to 100 orders; returns HTTP 202 |
| GET | `/batches/:batchId` | Read batch and per-order results |

### Normalized order request

The public contract uses `order_id` and `courier_partner`. Legacy `orderId` and `courierPartner` are accepted for compatibility. The remaining order fields are shared across courier integrations.

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H 'Content-Type: application/json' \
  -d '{
    "order_id": "ORDER-1001",
    "courier_partner": "mock",
    "customer": { "name": "Amit Kumar", "phone": "9876543210", "email": "amit@example.com" },
    "pickup": { "name": "Warehouse", "phone": "9876543210", "address": "MG Road", "city": "Indore", "state": "Madhya Pradesh", "pincode": "452001" },
    "delivery": { "name": "Ravi Sharma", "phone": "9876501234", "address": "Vijay Nagar", "city": "Indore", "state": "Madhya Pradesh", "pincode": "452010" },
    "package": { "weightKg": 1.2, "lengthCm": 12, "widthCm": 10, "heightCm": 10, "description": "Books", "declaredValue": 100, "pieces": 1, "itemQuantity": 1 },
    "paymentMode": "PREPAID"
  }'
```

For COD, set `paymentMode` to `COD` and include a non-negative `codAmount`. `package.declaredValue` defaults to 100; missing dimensions default to 1 cm and `pieces`/`itemQuantity` default to 1 for the UrbaneBolt manifest. Use `courier_partner: "urbanebolt"` after configuring UAT credentials and customer code.

### Track and cancel

```bash
curl http://localhost:3000/api/v1/orders/ORDER-1001/track
curl -X POST http://localhost:3000/api/v1/orders/ORDER-1001/cancel
curl http://localhost:3000/api/v1/orders/ORDER-1001
```

### Bulk create

```bash
curl -X POST http://localhost:3000/api/v1/orders/bulk \
  -H 'Content-Type: application/json' \
  -d '{ "orders": [ { "order_id": "BULK-001", "courier_partner": "mock", "customer": {"name":"Buyer","phone":"9876543210"}, "pickup": {"name":"Warehouse","phone":"9876543210","address":"MG Road","city":"Indore","state":"Madhya Pradesh","pincode":"452001"}, "delivery": {"name":"Buyer","phone":"9876501234","address":"Vijay Nagar","city":"Indore","state":"Madhya Pradesh","pincode":"452010"}, "package": {"weightKg":1}, "paymentMode":"PREPAID" } ] }'
```

The endpoint returns HTTP 202 and a `batchId` immediately. Poll the returned `statusUrl` or call `GET /api/v1/batches/:batchId`. Each item reports `PENDING`, `PROCESSING`, `COMPLETED`, or `FAILED`, plus an error reason when failed. Existing successful `order_id` values are not sent to the courier a second time; the batch item reuses the stored AWB and shipment status. Existing failed or indeterminate orders are not automatically resubmitted and are reported as failed items for reconciliation. Repeating a single create request returns `409 DUPLICATE_ORDER`.

### Supported couriers

```bash
curl http://localhost:3000/api/v1/couriers
```

An unknown identifier returns HTTP 400 with `details.supportedCouriers`.

## Bulk processing design

Bulk requests are validated and persisted transactionally as a `BulkBatch` and `BulkBatchItem` rows. The HTTP request does not wait for courier calls. An in-process worker claims a bounded number of rows concurrently, and clients poll for per-order outcomes. A processing lease lets a later poll reclaim jobs left in `PROCESSING` after a process crash. The courier adapter itself retries transient HTTP/network failures with exponential backoff; auth failures trigger one re-authentication and retry.

This database-backed queue keeps local setup simple. For multi-instance production deployment, replace it with a distributed queue (e.g. BullMQ/SQS) or implement database row locking/leases appropriate to the selected database. SQLite plus an in-process worker is an assignment/demo trade-off, not a horizontally scaled queue.

## Tests

```bash
npm test
npm run typecheck
```

Tests cover normalized input parsing, MockCourier behaviour and the UrbaneBolt manifest request mapping. Use MockCourier for repeatable local end-to-end checks. Live UrbaneBolt UAT tests require credentials and should be run deliberately because manifest creation creates real UAT shipments.

## Add another courier

1. Add a folder under `src/couriers/<partner>`.
2. Implement `CourierAdapter`: `authenticate`, `buildCreatePayload`, `createShipment`, `trackShipment`, and `cancelShipment`.
3. Keep all partner-specific HTTP paths, headers, payload mappings, response parsing and error translation inside that adapter.
4. Register one instance in `src/couriers/courier.registry.ts`.
5. Add its credentials, URL, timeout and retry settings to `src/config/env.ts` and `.env.example`.
6. Add adapter tests.

Do not change controllers, routes, normalized request schema, or `OrderService` when adding a normal create/track/cancel-capable adapter.

## Notes and limitations

- UrbaneBolt's documented manifest is an array of shipment objects; its documented cancel operation accepts `awbs`; tracking is looked up by AWB.
- The public collection does not include dependable example responses. AWB/status parsing is defensive and must be confirmed against UAT responses.
- UrbaneBolt cancellation documentation describes cancellation before pickup. The adapter cannot guarantee cancellation after handover.
- Tracking is pull-based; the public UAT collection does not document webhooks.
- Tracking history is append-only in application code. Raw courier payloads may contain personal information; restrict database/log access and define a retention policy before production.

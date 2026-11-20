# Design Document — Multi-Courier Integration Platform

## Objective and architecture

The service gives internal consumers one REST contract for creating, tracking and cancelling shipments. The caller chooses a `courier_partner`; it does not construct partner-specific payloads. The application is organized into Express routes/controllers, validation schemas, an order service, a courier adapter boundary, Prisma persistence and a database-backed bulk worker.

The **Adapter Pattern** isolates each courier's authentication, HTTP contract, payload mapping, response parsing and partner error translation. The **Strategy Pattern** lets the order service invoke a selected implementation through `CourierAdapter`. A small registry resolves the external identifier to an adapter. UrbaneBolt is the first external adapter and MockCourier is a second implementation proving that the same service can use another strategy.

Adding a conventional courier requires a new adapter and one registry/configuration entry. Existing controllers, routes, public DTOs and order service do not need partner-specific branches.

## Request flow

For a single create request, Zod converts the public snake_case identifiers (`order_id`, `courier_partner`) into the internal normalized model. The service resolves the adapter, builds the outbound courier payload, checks the globally unique order ID and persists the normalized request plus the exact outbound request before making the courier call. On success it stores the courier shipment reference, AWB, normalized status and raw response, then appends the initial history row. On failure it marks the order `FAILED`, stores a normalized error code and logs the order ID, courier, request ID and error stack.

Tracking reads the stored courier and AWB, invokes the adapter, updates the current status and appends a raw tracking event. Cancellation uses the stored AWB, stores the normalized cancellation status and appends the raw cancellation response. The original create response is retained; later tracking/cancellation responses are kept in the append-only history table.

## Courier adapter contract

Every adapter implements authentication, outbound create-payload construction, shipment creation, tracking and cancellation. UrbaneBolt uses its documented UAT token endpoint and bearer token. The manifest adapter sends an array of partner-native shipment objects; tracking is queried by AWB; cancellation submits an `awbs` value. The exact manifest mapping is contained in the UrbaneBolt adapter. The public UAT collection does not publish stable example responses, so the response parser is intentionally defensive and requires UAT verification before production.

Courier HTTP 4xx responses are translated to `COURIER_REQUEST_REJECTED`; transient 5xx/network failures use configurable exponential backoff. A 401 clears the cached token, authenticates once and retries the original request once. Raw partner error bodies are not returned to API consumers.

## Persistence model

- **Order**: internal database ID, unique `orderId`, courier partner, courier order/shipment ID, AWB, current status, exact outbound request payload, normalized consumer request payload, raw create response, last normalized error and timestamps.
- **TrackingHistory**: append-only status, event timestamp and raw partner payload linked to an order. Each successful create, tracking refresh and cancellation adds an event.
- **BulkBatch**: batch ID, total item count and timestamps.
- **BulkBatchItem**: order ID, normalized order payload, processing state, attempts, error, processing lease and next eligible time.

Prisma manages the SQLite schema. The unique constraint on `Order.orderId` is the final idempotency guard; duplicate requests never create a second shipment. A repeated single create receives 409. A later bulk submission reuses the stored result for an already successful order; failed or indeterminate existing records are not resubmitted and are reported for reconciliation.

## Bulk processing and trade-offs

`POST /orders/bulk` accepts 1–100 orders, validates them, stores the batch/items in one transaction and returns HTTP 202 with a batch ID. A worker polls and claims a bounded number of pending items using conditional updates, then processes them concurrently. Clients poll the batch endpoint for item-level completion and failure. A processing timestamp supports reclaiming abandoned work after a lease timeout. Courier-level retries happen inside the adapter so a job is not blindly re-submitted after an uncertain shipment-creation outcome.

SQLite and an in-process worker avoid Redis/Docker setup and are suitable for an interview assignment. They are not sufficient for horizontally scaled production processing: use a distributed queue or database-specific atomic row locking, leases, dead-letter handling and monitoring. A timeout after the courier created a shipment but before the response reached this service remains an inherently uncertain outcome; production reconciliation should query the courier by reference/AWB where supported before retrying.

## Security and operational assumptions

Secrets and partner URLs are environment-driven. `.env` is excluded from version control. Request IDs are returned in response headers and error bodies. Logs carry correlation IDs and structured order/courier context. Raw payloads can contain customer PII and therefore require restricted access, encryption at rest and a retention policy in production. The local MockCourier is for development/testing only. UAT credentials and `customerCode` must be provisioned by UrbaneBolt; no real credentials are shipped with this project.

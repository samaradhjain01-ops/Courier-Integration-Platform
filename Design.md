# Design Document

Author: Samaradh

## Objective

REST API for creating, tracking and cancelling shipments across multiple courier partners. Consumers submit a normalized order and identify the courier using `courierPartner`. They do not need to understand each courier's API.

## Architecture

The application uses Express controllers, an order service, a Prisma repository layer and courier adapters. The courier registry resolves a partner identifier to an implementation of the common `CourierAdapter` interface.

The Adapter Pattern translates the normalized internal model into a courier-specific request and translates the courier response back into a normalized result. The Strategy Pattern allows the order service to use any registered adapter through the same interface. A registry provides runtime selection.

The first adapters are UrbaneBolt and MockCourier. Adding another partner means implementing the interface and registering the adapter. Existing controllers, DTOs and business services remain unchanged.

## Request flow

For a single order, the API validates the normalized payload, checks the unique internal order ID, stores the request for audit, invokes the selected adapter and stores the courier identifiers and response. An initial tracking-history entry is created when shipment creation succeeds.

Tracking calls the selected courier using the stored AWB, updates the current status and appends a history record. Cancellation uses the stored courier shipment reference and appends a cancellation event.

## Persistence

SQLite is used to avoid requiring a separately installed database service. Prisma manages schema and migrations.

- `Order` stores the internal order ID, courier identifier, courier shipment ID, AWB, current status, raw request and response, error details and timestamps.
- `TrackingHistory` stores each status observation as a separate record with event time and raw payload.
- `BulkBatch` stores batch metadata.
- `BulkBatchItem` stores per-order processing state and error information.

The internal `orderId` has a unique constraint to prevent duplicate shipment records. Tracking history is append-only at the application level.

## Bulk processing

The bulk endpoint accepts up to 100 normalized orders, persists a batch and its items, then returns HTTP 202 with a batch ID. A background worker polls pending items and processes a small group concurrently. Consumers can retrieve batch progress and individual outcomes through the batch status endpoint.

This implementation uses a database-backed queue to avoid Redis or another infrastructure dependency. It is suitable for a self-contained assignment and local demonstration. For production with multiple application instances, a dedicated queue such as BullMQ or a database queue with atomic claiming and lease recovery would be preferable.

## Error handling and reliability

Validation errors use HTTP 400 and a common error structure. Unsupported courier identifiers return the supported courier list. Courier-specific errors are mapped to normalized codes. Authentication is refreshed once after an HTTP 401. Timeouts and transient failures should use configurable retry and backoff policies before final failure.

Failures are stored against the order and written to structured logs with request context. Production deployment should add a reconciliation worker for shipments whose outcome is uncertain after a network timeout.

## Trade-offs and assumptions

SQLite keeps setup simple but is not the recommended database for a high-throughput multi-instance deployment. The in-process worker is intentionally lightweight; it requires a running application process and needs stronger job claiming and recovery for production.

UrbaneBolt field mappings must be checked against the current UAT documentation and sample responses. Credentials are environment-driven and must never be committed. MockCourier is intended for local development and automated tests.

# Courier Integration Platform

Author: Samaradh

REST API built with Node.js, TypeScript, Express and SQLite.

## Requirements

- Node.js 20 or later
- npm

No separate database server, Redis or Docker installation is required.

## Setup

```bash
npm install
cp .env.example .env
npx prisma generate
npx prisma migrate dev --name init
npm run dev
```

On Windows Command Prompt, copy the environment file with:

```cmd
copy .env.example .env
```

The SQLite database is created locally by Prisma.

## Mock courier credentials

The local mock adapter uses these development-only values:

```text
Username: samaradh
Password: sholey
```

They are configured through `MOCK_COURIER_USERNAME` and `MOCK_COURIER_PASSWORD`. The mock adapter simulates courier operations and does not send these values to UrbaneBolt.

## UrbaneBolt configuration

Set `URBANEBOLT_USERNAME` and `URBANEBOLT_PASSWORD` in `.env` when UAT credentials are available. The UrbaneBolt adapter uses `URBANEBOLT_BASE_URL` and a configurable request timeout.

The manifest request and response field mapping must be verified against the current UAT documentation and actual UAT responses before live use. The adapter isolates those partner-specific details from the unified API.

## Run

```bash
npm run dev
```

Build and run:

```bash
npm run build
npm start
```

## Endpoints

| Method | Endpoint | Purpose |
|---|---|---|
| GET | `/api/v1/health` | Health check |
| GET | `/api/v1/couriers` | Supported courier identifiers |
| POST | `/api/v1/orders` | Create shipment |
| GET | `/api/v1/orders/:orderId` | Get order and history |
| GET | `/api/v1/orders/:orderId/track` | Refresh tracking |
| POST | `/api/v1/orders/:orderId/cancel` | Cancel shipment |
| POST | `/api/v1/orders/bulk` | Submit up to 100 orders |
| GET | `/api/v1/batches/:batchId` | Get batch progress |

## Create order example

```bash
curl -X POST http://localhost:3000/api/v1/orders \
  -H "Content-Type: application/json" \
  -d '{
    "orderId": "ORDER-1001",
    "courierPartner": "mock",
    "customer": {
      "name": "Amit Kumar",
      "phone": "9876543210"
    },
    "pickup": {
      "name": "Warehouse",
      "phone": "9876543210",
      "address": "MG Road",
      "city": "Indore",
      "state": "Madhya Pradesh",
      "pincode": "452001"
    },
    "delivery": {
      "name": "Ravi Sharma",
      "phone": "9876501234",
      "address": "Vijay Nagar",
      "city": "Indore",
      "state": "Madhya Pradesh",
      "pincode": "452010"
    },
    "package": {
      "weightKg": 1.2,
      "description": "Books"
    },
    "paymentMode": "PREPAID"
  }'
```

Change `courierPartner` to `urbanebolt` to use the UrbaneBolt adapter after configuring UAT credentials.

## Bulk order example

Send an object with an `orders` array containing up to 100 normalized orders. The endpoint returns HTTP 202 and a `batchId`. Poll `/api/v1/batches/:batchId` for item-level results.

## Tests

```bash
npm test
```

## Adding a courier

1. Create a folder under `src/couriers`.
2. Implement `CourierAdapter`.
3. Add partner-specific authentication, request mapping and response mapping inside the adapter.
4. Register the adapter in `src/couriers/courier.registry.ts`.
5. Add environment variables for its credentials and configuration.
6. Add adapter tests.

Controllers, unified request schemas and order service should not need courier-specific changes.

## Design notes

See `DESIGN.md` for architecture, persistence and trade-offs.

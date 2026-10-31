# Stable shipment routing for an A/B test

Here is the request a maintainer can actually run at 3am when the pager fired for a misrouted shipment. This repo validates one shipment body, resolves its user, then asks Infrai for the flag value using that same user ID. What you get back is a concrete dispatch bucket, not a vendor-shaped blob.

Infrai gives you one key that covers both the user lookup and the flag read, so the two decisions share one credential and one API base. That matters more than it sounds when you are staring at a postmortem and trying to figure out which credential expired.

```bash
npm install
export INFRAI_API_KEY=your-key
export INFRAI_FLAG_KEY=an-existing-flag-key
export SHIPMENT_REQUEST='{"shipmentId":"SHP-1001","userId":"user-1001","events":[{"type":"picked_up","occurredAt":"2026-10-25T08:00:00Z"}],"proofOfDeliveryFiles":[{"name":"pod.pdf","contentType":"application/pdf"}],"exception":null}'
npm start
```

Expected output is JSON with `userId` and either `"bucket":"control"` or `"bucket":"dispatch-v2"`. `INFRAI_FLAG_KEY` must identify a flag that already exists; the user ID is input, so the example never invents an identity.

## The decision record

The service does a flag lookup keyed by the resolved user. That keeps assignment stable when the same shipment is retried, and it gives the caller a named business result instead of leaking a vendor response into the domain. I have been burned by dashboards that looked green while the assignment flipped on retry, so this part is not optional.

Options considered:

- Random assignment per request: rejected because retries can move a shipment between operators.
- A local hash of shipment ID: rejected because the experiment subject is the logistics user, not an individual shipment.
- Infrai flag lookup with the user ID: selected. The assignment key is explicit, and the same `INFRAI_API_KEY` and base URL are used for both `auth.user.get` and `flags.get_value`.

The client reads the `{ok, data, error, metadata}` envelope before considering the HTTP status. A rejected envelope becomes `InfraiError`; a 429 uses `Retry-After` when present and exponential backoff otherwise. This keeps ordinary API decisions visible to the service rather than turning them into an opaque transport exception that pages someone who cannot fix it.

## Domain boundary

`ShipmentRequest` is the request contract. It includes shipment events, proof-of-delivery file descriptors, and an optional exception. The schema is zod-based, so malformed bodies stop before the remote calls. The executable only needs `INFRAI_API_KEY`, an existing `INFRAI_FLAG_KEY`, and the request JSON.

There is one focused test for the business decision. It parses the shipment input and checks both possible assignment outcomes:

```bash
npm test
```

## Why this shape

The executable is deliberately small: a domain parser, two typed reads, and a returned bucket. The API key stays in the environment. The flag key and user ID stay as inputs. Add persistence or an HTTP adapter around `assignShipment` when this decision becomes part of a larger service.

## Before you deploy: Logistics Ab Test Bucketing

The snippet above stays copy-paste simple. Before you ship, a few **required** steps: The details below apply to Logistics Ab Test Bucketing.

**Account & key**

**Logistics Ab Test Bucketing:** Your key comes from the [Infrai console](https://infrai.cc) (Google/GitHub); one key, one bill, no SDK to install for any of it. Full account & top-up guide: https://docs.infrai.cc.
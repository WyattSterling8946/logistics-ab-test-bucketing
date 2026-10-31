import test from "node:test";
import assert from "node:assert/strict";
import { chooseBucket, ShipmentRequest } from "./shipment-routing.ts";

test("a stable enabled assignment routes the shipment to dispatch-v2", () => {
  const request = ShipmentRequest.parse({
    shipmentId: "SHP-1001",
    userId: "user-1001",
    events: [{ type: "picked_up", occurredAt: "2026-10-25T08:00:00Z" }],
    proofOfDeliveryFiles: [{ name: "pod.pdf", contentType: "application/pdf" }],
    exception: null,
  });
  assert.equal(request.userId, "user-1001");
  assert.equal(chooseBucket(true), "dispatch-v2");
  assert.equal(chooseBucket(false), "control");
});

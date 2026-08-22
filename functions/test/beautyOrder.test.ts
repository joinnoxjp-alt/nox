import test from "node:test";
import assert from "node:assert/strict";
import {
  beautySettlementDue,
  beautySettlementReason,
  canTransitionBeautyOrder,
  calculateBeautyAmounts,
  calculateBeautyOrderFromProduct,
  confirmBeautyShipping,
  isBeautyOrderSettlementEligible
} from "../src/domain/beautyOrder";

test("MIST is split 20/80 and shipping is excluded from the NOX reward", () => {
  assert.deepEqual(calculateBeautyAmounts(3600, 1, 800), {
    subtotal: 3600,
    shippingFee: 800,
    total: 4400,
    noxReward: 720,
    mireioSettlement: 3680
  });
});

test("the three-product set is split using the 17,900 yen server price", () => {
  assert.deepEqual(calculateBeautyAmounts(17900, 1), {
    subtotal: 17900,
    shippingFee: 0,
    total: 17900,
    noxReward: 3580,
    mireioSettlement: 14320
  });
});

test("quantity two calculates commission on the full merchandise subtotal", () => {
  assert.deepEqual(calculateBeautyAmounts(8000, 2, 900), {
    subtotal: 16000,
    shippingFee: 900,
    total: 16900,
    noxReward: 3200,
    mireioSettlement: 13700
  });
});

test("client supplied prices are ignored in favor of the product price", () => {
  assert.deepEqual(
    calculateBeautyOrderFromProduct(
      { price: 8000 },
      { quantity: 2, unitPrice: 1, price: 1 },
      900
    ),
    {
      subtotal: 16000,
      shippingFee: 900,
      total: 16900,
      noxReward: 3200,
      mireioSettlement: 13700
    }
  );
});

test("settlement becomes due at ten items", () => {
  const now = 10_000_000_000;
  assert.equal(beautySettlementDue(10, now, now), true);
  assert.equal(beautySettlementReason(10, now, now), "quantity_threshold");
});

test("settlement becomes due after seven days when below ten items", () => {
  const now = 10_000_000_000;
  assert.equal(beautySettlementDue(1, now - 7 * 86_400_000, now), true);
  assert.equal(
    beautySettlementReason(1, now - 7 * 86_400_000, now),
    "weekly_threshold"
  );
  assert.equal(beautySettlementDue(9, now - 6 * 86_400_000, now), false);
});

test("cancelled, unpaid, and settled orders are excluded from settlement", () => {
  assert.equal(isBeautyOrderSettlementEligible({ orderStatus: "cancelled" }), false);
  assert.equal(isBeautyOrderSettlementEligible({ orderStatus: "received" }), false);
  assert.equal(isBeautyOrderSettlementEligible({ orderStatus: "awaiting_payment" }), false);
  assert.equal(isBeautyOrderSettlementEligible({ orderStatus: "paid" }), true);
  assert.equal(isBeautyOrderSettlementEligible({ orderStatus: "completed" }), true);
  assert.equal(isBeautyOrderSettlementEligible({ orderStatus: "paid", settlementStatus: "settled" }), false);
});

test("the complete order status path is valid and skips are rejected", () => {
  const path = [
    "received",
    "awaiting_payment",
    "paid",
    "fulfillment_requested",
    "shipped",
    "completed"
  ];
  for (let index = 0; index < path.length - 1; index += 1) {
    assert.equal(canTransitionBeautyOrder(path[index], path[index + 1]), true);
  }
  assert.equal(canTransitionBeautyOrder("received", "completed"), false);
  assert.equal(canTransitionBeautyOrder("completed", "cancelled"), false);
});

test("confirmed shipping changes buyer and partner totals but not NOX reward", () => {
  assert.deepEqual(confirmBeautyShipping({ subtotal: 3600, noxReward: 720 }, 880), {
    shippingFee: 880,
    total: 4480,
    noxReward: 720,
    mireioMerchandiseShare: 2880,
    mireioSettlement: 3760
  });
});

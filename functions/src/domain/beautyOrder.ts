export const BEAUTY_ORDER_STATUSES=["received","awaiting_payment","paid","fulfillment_requested","shipped","completed","cancelled"] as const;
export function calculateBeautyAmounts(unitPrice:number,quantity:number,shippingFee=0){if(!Number.isInteger(unitPrice)||unitPrice<0||!Number.isInteger(quantity)||quantity<1||quantity>10||!Number.isInteger(shippingFee)||shippingFee<0)throw new Error("invalid amounts");const subtotal=unitPrice*quantity;const noxReward=Math.floor(subtotal*.2);return{subtotal,shippingFee,total:subtotal+shippingFee,noxReward,mireioSettlement:subtotal-noxReward+shippingFee}}
export function beautySettlementDue(unsettledQuantity:number,oldestCreatedAtMs:number,nowMs=Date.now()){return unsettledQuantity>=10||(unsettledQuantity>0&&nowMs-oldestCreatedAtMs>=7*24*60*60*1000)}

export function calculateBeautyOrderFromProduct(
  product: Record<string, unknown>,
  request: { quantity: unknown; unitPrice?: unknown; price?: unknown },
  shippingFee = 0
) {
  return calculateBeautyAmounts(
    Number(product.price),
    Number(request.quantity),
    shippingFee
  );
}

export function isBeautyOrderSettlementEligible(order: {
  orderStatus?: unknown;
  settlementStatus?: unknown;
}) {
  return order.settlementStatus !== "settled"
    && ["paid", "fulfillment_requested", "shipped", "completed"]
      .includes(String(order.orderStatus || ""));
}

export function beautySettlementReason(
  unsettledQuantity: number,
  oldestCreatedAtMs: number,
  nowMs = Date.now()
) {
  if (unsettledQuantity >= 10) return "quantity_threshold" as const;
  if (unsettledQuantity > 0
    && nowMs - oldestCreatedAtMs >= 7 * 24 * 60 * 60 * 1000) {
    return "weekly_threshold" as const;
  }
  return "not_due" as const;
}

const BEAUTY_STATUS_TRANSITIONS: Record<string, string[]> = {
  received: ["awaiting_payment", "cancelled"],
  awaiting_payment: ["paid", "cancelled"],
  paid: ["fulfillment_requested", "cancelled"],
  fulfillment_requested: ["shipped", "cancelled"],
  shipped: ["completed"],
  completed: [],
  cancelled: []
};

export function canTransitionBeautyOrder(from: string, to: string) {
  return BEAUTY_STATUS_TRANSITIONS[from]?.includes(to) === true;
}

export function confirmBeautyShipping(
  order: { subtotal: unknown; noxReward: unknown },
  shippingFee: number
) {
  const subtotal = Number(order.subtotal);
  const noxReward = Number(order.noxReward);
  if (!Number.isInteger(subtotal) || subtotal < 0
    || !Number.isInteger(noxReward) || noxReward < 0
    || !Number.isInteger(shippingFee) || shippingFee < 0) {
    throw new Error("invalid shipping amounts");
  }
  return {
    shippingFee,
    total: subtotal + shippingFee,
    noxReward,
    mireioMerchandiseShare: subtotal - noxReward,
    mireioSettlement: subtotal - noxReward + shippingFee
  };
}

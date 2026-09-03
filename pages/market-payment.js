/* Payment provider boundary. Replace this adapter with a callable Function
 * that creates a Stripe Checkout Session; never trust price data from here. */
export const marketPayment = Object.freeze({
  provider: "unconnected",
  isAvailable: false,
  async beginCheckout() {
    throw new Error("PAYMENT_NOT_CONNECTED");
  }
});

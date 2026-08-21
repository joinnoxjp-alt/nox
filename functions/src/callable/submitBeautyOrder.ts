import { createHash, randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { HttpsError, onCall } from "firebase-functions/v2/https";
import { publicCallableOptions } from "../config";
import { calculateBeautyOrderFromProduct } from "../domain/beautyOrder";
import { firestore } from "../firebaseAdmin";

function text(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function publicPaymentInstructions(settings: Record<string, unknown>) {
  const instructions = {
    bankName: text(settings.bankName, 100),
    branchName: text(settings.branchName, 100),
    accountType: text(settings.accountType, 20),
    accountNumber: text(settings.accountNumber, 30),
    accountHolder: text(settings.accountHolder, 100),
    recipientType: "NOX運営者本人名義",
    paymentDueDays: Number(settings.paymentDueDays) || 7,
    shippingLabel: text(settings.shippingLabel, 160)
      || "送料別途 / 地域により異なる"
  };
  return [instructions.bankName, instructions.branchName, instructions.accountType, instructions.accountNumber, instructions.accountHolder].every(Boolean)
    ? instructions
    : null;
}

export const submitBeautyOrder = onCall(
  { ...publicCallableOptions, memory: "256MiB", timeoutSeconds: 30 },
  async (request) => {
    const data = request.data ?? {};
    if (text(data.website, 100)) {
      throw new HttpsError("invalid-argument", "送信できませんでした。");
    }

    const productId = text(data.productId, 128);
    const quantity = Number(data.quantity);
    const customerName = text(data.customerName, 80);
    const customerKana = text(data.customerKana, 100);
    const postalCode = text(data.postalCode, 12);
    const address = text(data.address, 200);
    const phone = text(data.phone, 30);
    const email = text(data.email, 160).toLowerCase();
    const note = text(data.note, 1000);

    if (
      !/^[a-z0-9-]+$/.test(productId)
      || !Number.isInteger(quantity)
      || quantity < 1
      || quantity > 10
      || !customerName
      || !customerKana
      || !/^[0-9０-９-]{7,9}$/.test(postalCode)
      || !address
      || phone.replace(/\D/g, "").length < 10
      || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
      || data.agreed !== true
    ) {
      throw new HttpsError("invalid-argument", "入力内容をご確認ください。");
    }

    const [productSnapshot, commerceSnapshot] = await Promise.all([
      firestore.doc(`beautyProducts/${productId}`).get(),
      firestore.doc("beautySettings/commerce").get()
    ]);
    const commerceSettings = commerceSnapshot.data() || {};
    if (commerceSettings.salesEnabled !== true) {
      throw new HttpsError("failed-precondition", "現在、販売受付を停止しています。");
    }
    if (!productSnapshot.exists || productSnapshot.data()?.isPublic !== true) {
      throw new HttpsError("not-found", "商品を購入できません。");
    }
    const product = productSnapshot.data()!;
    const serverPrice = Number(product.price);
    if (!Number.isInteger(serverPrice) || serverPrice < 1) {
      throw new HttpsError("failed-precondition", "商品価格を確認できません。");
    }

    // Financial values are derived only from the Firestore product document.
    // Any client-supplied price or commission field is deliberately ignored.
    const amounts = calculateBeautyOrderFromProduct(product, data, 0);
    const requestId = text(data.requestId, 128) || randomUUID();
    const dedupeId = createHash("sha256")
      .update(`beauty|${requestId}`)
      .digest("hex");
    const orderReference = firestore.collection("beautyOrders").doc();

    await firestore.runTransaction(async (transaction) => {
      const dedupeReference = firestore.doc(`beautyOrderDedupe/${dedupeId}`);
      const existing = await transaction.get(dedupeReference);
      if (existing.exists) {
        throw new HttpsError("already-exists", "この注文は受付済みです。");
      }
      transaction.create(orderReference, {
        orderId: orderReference.id,
        brandId: text(product.brandId, 128),
        productId,
        productName: text(product.name, 200),
        quantity,
        unitPrice: serverPrice,
        ...amounts,
        shippingStatus: "pending_quote",
        customerName,
        customerKana,
        postalCode,
        address,
        phone,
        email,
        note,
        paymentMethod: "bank_transfer",
        paymentStatus: "unpaid",
        orderStatus: "received",
        trackingNumber: "",
        settlementStatus: "unsettled",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
        paidAt: null,
        shippedAt: null,
        completedAt: null
      });
      transaction.create(dedupeReference, {
        orderId: orderReference.id,
        createdAt: FieldValue.serverTimestamp()
      });
    });

    return {
      success: true,
      orderId: orderReference.id,
      productName: text(product.name, 200),
      quantity,
      subtotal: amounts.subtotal,
      shippingFee: null,
      total: null,
      paymentMethod: "bank_transfer",
      paymentInstructions: publicPaymentInstructions(commerceSettings)
    };
  }
);

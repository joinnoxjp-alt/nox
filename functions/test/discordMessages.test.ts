import assert from "node:assert/strict";
import {
  test
} from "node:test";

import {
  buildJobApplicationCreatedMessage,
  buildStoreApplicationCreatedMessage,
  buildStoreReviewCreatedMessage,
  buildStoreReservationCreatedMessage,
  buildAmbassadorInquiryCreatedMessage,
  buildUserCreatedMessage
} from "../src/notifications/discordMessages";

test("ambassador inquiry message contains casting and contact details", () => {
  const result = buildAmbassadorInquiryCreatedMessage("inquiry-1", {
    ambassador: "NOXにおまかせ", companyName: "テストブランド",
    contactName: "担当者", email: "contact@example.test", phone: "09000000000",
    productName: "テスト商品", productUrl: "https://example.test/product",
    channels: ["Instagram", "撮影モデル"], preferredTiming: "2026年9月",
    budget: "10万円", productProvided: "あり", details: "PR相談詳細"
  }, EVENT_TIME);
  assert.match(result.content, /新規アンバサダーPR相談/);
  assert.match(result.content, /希望アンバサダー：NOXにおまかせ/);
  assert.match(result.content, /希望SNS：Instagram/);
  assert.match(result.content, /希望PR内容：Instagram \/ 撮影モデル/);
  assert.match(result.content, /メールアドレス：contact@example\.test/);
  assert.deepEqual(result.allowed_mentions.parse, []);
});

const EVENT_TIME =
  "2026-07-26T00:00:00.000Z";

test("review message contains moderation fields", () => {
  const result = buildStoreReviewCreatedMessage("review-1", {storeName:"テスト店舗",flowRating:4,supportRating:5,publishPermission:"anonymous",status:"pending"}, EVENT_TIME);
  assert.match(result.content, /NOX 新規口コミ/);
  assert.match(result.content, /評価：4\.5/);
  assert.match(result.content, /口コミID：review-1/);
});

test(
  "new user message contains only minimal member information",
  () => {
    const result = buildUserCreatedMessage(
      {
        nickname: "テスト会員",
        email: "private@example.test",
        phone: "09000000000",
        role: "user"
      },
      EVENT_TIME
    );

    assert.match(
      result.content,
      /👤 新規会員登録/
    );
    assert.match(
      result.content,
      /表示名：テスト会員/
    );
    assert.doesNotMatch(
      result.content,
      /private@example\.test|09000000000/
    );
    assert.deepEqual(
      result.allowed_mentions.parse,
      []
    );
  }
);

test("reservation message identifies NOX traffic and benefit eligibility", () => {
  const result = buildStoreReservationCreatedMessage("reservation-1", {
    storeName: "Bar 8 ～Eight～", storeId: "aCtKyqRJmPskKwxAEDTv",
    name: "テスト", phone: "00000000000", desiredDate: "2026-08-17",
    desiredTime: "21:20", people: 1, content: "席予約", notes: "",
    benefitEligible: true, benefitTitle: "NOX限定！3時間飲み放題3,000円",
    status: "new"
  }, EVENT_TIME);
  assert.match(result.content, /NOX予約リクエスト/);
  assert.match(result.content, /「NOXを見た」でのご予約です/);
  assert.match(result.content, /NOX限定特典利用対象/);
  assert.match(result.content, /ステータス：確認待ち/);
});

test(
  "job application message contains the approved operational fields",
  () => {
    const result =
      buildJobApplicationCreatedMessage(
        {
          storeName: "テスト店舗",
          businessScope: "general",
          position: "ホールスタッフ",
          businessType: "飲食店",
          area: "東京都"
        },
        EVENT_TIME
      );

    assert.match(
      result.content,
      /📄 新しい求人掲載申請/
    );
    assert.match(
      result.content,
      /掲載区分：一般求人/
    );
    assert.match(
      result.content,
      /求人タイトル：ホールスタッフ/
    );
    assert.match(
      result.content,
      /https:\/\/joinnox\.jp\/pages\/admin\.html/
    );
  }
);

test(
  "store application message contains the requested review fields",
  () => {
    const result =
      buildStoreApplicationCreatedMessage(
        {
          storeName: "掲載テスト店舗",
          businessScope: "both",
          businessType: "サービス業",
          area: "大阪府",
          contactName: "テスト担当",
          contactEmail:
            "store-contact@example.test",
          contactPhone: "0600000000"
        },
        EVENT_TIME
      );

    assert.match(
      result.content,
      /🏪 店舗掲載申請/
    );
    assert.match(
      result.content,
      /掲載区分：両方/
    );
    assert.match(
      result.content,
      /メール：store-contact@example\.test/
    );
    assert.match(
      result.content,
      /電話番号：0600000000/
    );
  }
);

test(
  "message sanitization prevents mentions and control characters",
  () => {
    const result = buildUserCreatedMessage(
      {
        nickname:
          "@everyone\u0000\nテスト"
      },
      EVENT_TIME
    );

    assert.deepEqual(
      result.allowed_mentions.parse,
      []
    );
    assert.doesNotMatch(
      result.content,
      /\u0000/
    );
    assert.ok(result.content.length <= 2000);
  }
);

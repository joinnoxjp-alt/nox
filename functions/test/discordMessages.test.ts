import assert from "node:assert/strict";
import {
  test
} from "node:test";

import {
  buildJobApplicationCreatedMessage,
  buildStoreApplicationCreatedMessage,
  buildUserCreatedMessage
} from "../src/notifications/discordMessages";

const EVENT_TIME =
  "2026-07-26T00:00:00.000Z";

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

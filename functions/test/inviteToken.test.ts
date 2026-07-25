import assert from "node:assert/strict";
import test from "node:test";

import {
  STORE_INVITE_ERROR_CODES,
  StoreInviteUtilityError
} from "../src/errors/storeInviteErrors";

import {
  generateInviteToken,
  generateInviteTokenMaterial,
  hashInviteToken,
  normalizeInviteEmail
} from "../src/security/inviteToken";

test(
  "generateInviteToken returns 256-bit base64url data",
  () => {
    const token = generateInviteToken();

    assert.equal(token.length, 43);
    assert.match(token, /^[A-Za-z0-9_-]+$/);
    assert.equal(
      Buffer.from(token, "base64url").length,
      32
    );
  }
);

test(
  "generateInviteToken does not use base64 padding",
  () => {
    const token = generateInviteToken();

    assert.equal(token.includes("="), false);
    assert.equal(token.includes("+"), false);
    assert.equal(token.includes("/"), false);
  }
);

test(
  "generated invite tokens are unique in a sample",
  () => {
    const tokens = new Set(
      Array.from(
        { length: 256 },
        () => generateInviteToken()
      )
    );

    assert.equal(tokens.size, 256);
  }
);

test(
  "normalizeInviteEmail trims and lowercases",
  () => {
    assert.equal(
      normalizeInviteEmail(
        "  Store.Owner+NOX@Example.COM  "
      ),
      "store.owner+nox@example.com"
    );
  }
);

test(
  "normalizeInviteEmail rejects an empty value",
  () => {
    assert.throws(
      () => normalizeInviteEmail("   "),
      (error: unknown) =>
        error instanceof StoreInviteUtilityError &&
        error.code ===
          STORE_INVITE_ERROR_CODES.INVALID_EMAIL
    );
  }
);

test(
  "hashInviteToken matches the SHA-256 test vector",
  () => {
    assert.equal(
      hashInviteToken("abc"),
      "ba7816bf8f01cfea414140de5dae2223" +
        "b00361a396177a9cb410ff61f20015ad"
    );
  }
);

test(
  "hashInviteToken is deterministic lowercase hex",
  () => {
    const first = hashInviteToken("fixed-token");
    const second = hashInviteToken("fixed-token");

    assert.equal(first, second);
    assert.match(first, /^[a-f0-9]{64}$/);
  }
);

test(
  "hashInviteToken distinguishes different tokens",
  () => {
    assert.notEqual(
      hashInviteToken("token-one"),
      hashInviteToken("token-two")
    );
  }
);

test(
  "hashInviteToken rejects empty tokens without disclosure",
  () => {
    const sensitiveValue =
      "must-not-appear-in-errors";

    assert.throws(
      () => hashInviteToken(""),
      (error: unknown) => {
        assert.ok(
          error instanceof StoreInviteUtilityError
        );
        assert.equal(
          error.code,
          STORE_INVITE_ERROR_CODES.INVALID_TOKEN
        );
        assert.equal(
          error.message.includes(sensitiveValue),
          false
        );

        return true;
      }
    );
  }
);

test(
  "generateInviteTokenMaterial returns a matching hash",
  () => {
    const material = generateInviteTokenMaterial();

    assert.equal(
      material.tokenHash,
      hashInviteToken(material.token)
    );
  }
);

test(
  "invite token utilities do not write to console",
  () => {
    let calls = 0;

    const originalLog = console.log;
    const originalError = console.error;
    const originalWarn = console.warn;

    console.log = () => {
      calls += 1;
    };
    console.error = () => {
      calls += 1;
    };
    console.warn = () => {
      calls += 1;
    };

    try {
      const material = generateInviteTokenMaterial();
      hashInviteToken(material.token);
      normalizeInviteEmail("store@example.com");
    } finally {
      console.log = originalLog;
      console.error = originalError;
      console.warn = originalWarn;
    }

    assert.equal(calls, 0);
  }
);

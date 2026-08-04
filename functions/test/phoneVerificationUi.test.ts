import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const page = readFileSync(resolve(__dirname, "../../../pages/phone-verification.html"), "utf8");
const script = readFileSync(resolve(__dirname, "../../../pages/phone-verification.js"), "utf8");
const register = readFileSync(resolve(__dirname, "../../../pages/register.html"), "utf8");
const mypage = readFileSync(resolve(__dirname, "../../../pages/mypage.html"), "utf8");

test("phone verification links the credential to the current user", () => {
  assert.match(page, /RecaptchaVerifier/);
  assert.match(page, /PhoneAuthProvider/);
  assert.match(page, /linkWithCredential\(user, credential\)/);
  assert.match(page, /httpsCallable\(functions, "syncPhoneIdentity"\)/);
  assert.match(page, /startResendWait/);
  assert.match(page, /unlink\(linkedUser, PhoneAuthProvider\.PROVIDER_ID\)/);
  assert.match(page, /window\.addEventListener\("pagehide", cleanupPageResources/);
  assert.match(page, /SEND_LIMIT = 3/);
});

test("Japanese phone variants normalize to one E.164 representation", () => {
  const load = new Function(
    `${script.replaceAll("export ", "")}; return { normalizeJapanesePhoneNumber, shouldRollbackLinkedPhoneCredential };`,
  ) as () => {
    normalizeJapanesePhoneNumber(value: string): string;
    shouldRollbackLinkedPhoneCredential(error: { code: string }): boolean;
  };
  const helpers = load();
  const normalize = helpers.normalizeJapanesePhoneNumber;
  assert.equal(normalize("090-1234-5678"), "+819012345678");
  assert.equal(normalize("090 1234 5678"), "+819012345678");
  assert.equal(normalize("+819012345678"), "+819012345678");
  assert.throws(() => normalize("12345"));
  assert.equal(helpers.shouldRollbackLinkedPhoneCredential({ code: "functions/already-exists" }), true);
  assert.equal(helpers.shouldRollbackLinkedPhoneCredential({ code: "functions/unavailable" }), false);
});

test("existing registration and mypage only add optional NOX CHANCE links", () => {
  assert.match(register, /createUserWithEmailAndPassword/);
  assert.match(register, /phone-verification\.html/);
  assert.match(mypage, /phone-verification\.html/);
});

test("browser sends no phone number to the identity callable", () => {
  assert.match(page, /syncPhoneIdentity\(\{\}\)/);
  assert.doesNotMatch(page, /syncPhoneIdentity\(\{\s*phone/);
});

test("sync does not remove the existing registration phone field", () => {
  const callable = readFileSync(
    resolve(__dirname, "../src/callable/syncPhoneIdentity.js"),
    "utf8",
  );
  assert.doesNotMatch(callable, /phone:\s*FieldValue\.delete/);
  assert.doesNotMatch(callable, /console\.|logger\./);
  assert.doesNotMatch(callable, /return\s*\{[^}]*phoneIdentity(?:\s|,|:)/s);
});

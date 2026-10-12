import assert from "node:assert/strict";
import test from "node:test";

import { findClaimsForAddress, toClaimArgs, validateClaimItems } from "../web/lib/claims-data.mjs";

const fixtures = [
  {
    token_id: 7,
    owner: "0xAbCd000000000000000000000000000000001234",
    proof: ["11".repeat(32), `0x${"22".repeat(32)}`],
  },
  {
    token_id: 8,
    owner: "abcd000000000000000000000000000000001234",
    proof: ["33".repeat(32)],
  },
  {
    token_id: 9,
    owner: "0x0000000000000000000000000000000000000001",
    proof: [],
  },
];

test("findClaimsForAddress matches owners case-insensitively and with optional 0x prefixes", () => {
  assert.deepEqual(
    findClaimsForAddress(fixtures, "0xABCD000000000000000000000000000000001234").map(
      ({ token_id }) => token_id,
    ),
    [7, 8],
  );
});

test("findClaimsForAddress returns no entries for malformed or ineligible addresses", () => {
  assert.deepEqual(findClaimsForAddress(fixtures, "not-an-address"), []);
  assert.deepEqual(findClaimsForAddress(fixtures, "0x0000000000000000000000000000000000000002"), []);
});

test("toClaimArgs prefixes proof words and preserves the connected account", () => {
  assert.deepEqual(toClaimArgs(fixtures[0], "0xABCD000000000000000000000000000000001234"), [
    "0xABCD000000000000000000000000000000001234",
    7,
    [`0x${"11".repeat(32)}`, `0x${"22".repeat(32)}`],
  ]);
});

test("toClaimArgs normalises an uppercase proof prefix", () => {
  assert.deepEqual(
    toClaimArgs({ ...fixtures[0], proof: [`0X${"AA".repeat(32)}`] }, fixtures[0].owner)[2],
    [`0x${"AA".repeat(32)}`],
  );
});

test("toClaimArgs rejects malformed proof words", () => {
  assert.throws(
    () => toClaimArgs({ ...fixtures[0], proof: ["beef"] }, fixtures[0].owner),
    /invalid proof word/i,
  );
});

test("validateClaimItems rejects invalid uint32 IDs and duplicate token IDs", () => {
  assert.throws(
    () => validateClaimItems([{ ...fixtures[0], token_id: 0x1_0000_0000 }]),
    /invalid token id/i,
  );
  assert.throws(
    () => validateClaimItems([fixtures[0], { ...fixtures[0] }]),
    /duplicate token id/i,
  );
  assert.equal(validateClaimItems(fixtures), fixtures);
});

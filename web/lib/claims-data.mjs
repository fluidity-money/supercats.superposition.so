const ADDRESS_RE = /^(?:0x)?[0-9a-f]{40}$/i;
const WORD_RE = /^(?:0x)?[0-9a-f]{64}$/i;

function normaliseAddress(address) {
  if (typeof address !== "string" || !ADDRESS_RE.test(address)) return undefined;
  return address.replace(/^0x/i, "").toLowerCase();
}

export function findClaimsForAddress(items, address) {
  const account = normaliseAddress(address);
  if (!account || !Array.isArray(items)) return [];
  return items.filter((item) => normaliseAddress(item?.owner) === account);
}

export function toClaimArgs(item, account) {
  if (!normaliseAddress(account)) throw new Error("Invalid claim account");
  if (!Number.isInteger(item?.token_id) || item.token_id < 0 || item.token_id > 0xffff_ffff) {
    throw new Error("Invalid token ID");
  }
  if (!Array.isArray(item.proof)) throw new Error("Invalid Merkle proof");

  const proof = item.proof.map((word) => {
    if (typeof word !== "string" || !WORD_RE.test(word)) {
      throw new Error("Invalid proof word");
    }
    return word.slice(0, 2).toLowerCase() === "0x" ? `0x${word.slice(2)}` : `0x${word}`;
  });

  return [account, item.token_id, proof];
}

export function validateClaimItems(items) {
  if (!Array.isArray(items)) throw new Error("Invalid claim proof set");
  const tokenIds = new Set();
  for (const item of items) {
    if (!item || typeof item !== "object") throw new Error("Invalid claim proof item");
    toClaimArgs(item, item.owner);
    if (tokenIds.has(item.token_id)) throw new Error("Duplicate token ID");
    tokenIds.add(item.token_id);
  }
  return items;
}

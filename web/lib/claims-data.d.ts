declare module "@/web/lib/claims-data.mjs" {
  export type ClaimProof = {
    token_id: number;
    owner: string;
    proof: string[];
  };

  export function findClaimsForAddress(items: ClaimProof[], address: string): ClaimProof[];
  export function toClaimArgs(item: ClaimProof, account: string): readonly [string, number, `0x${string}`[]];
  export function validateClaimItems(items: unknown): ClaimProof[];
}

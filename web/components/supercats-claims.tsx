"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Address, Hash } from "viem";
import {
  useAccount,
  useChainId,
  useConnect,
  useDisconnect,
  usePublicClient,
  useReadContract,
  useSwitchChain,
  useWriteContract,
} from "wagmi";
import {
  findClaimsForAddress,
  toClaimArgs,
  validateClaimItems,
  type ClaimProof,
} from "@/web/lib/claims-data.mjs";
import { superposition } from "@/web/lib/wagmi";

// The canonical Supercats collection address. Keep this explicit: claims must
// never be redirected through runtime configuration or user input.
export const SUPERCATS_ADDRESS: Address = "0x3FCA3E72787973C8f6891d2d43EC398bb1aC1F61";

const claimAbi = [
  {
    type: "function",
    name: "claim",
    stateMutability: "nonpayable",
    inputs: [
      { name: "account", type: "address" },
      { name: "tokenId", type: "uint32" },
      { name: "merkleProof", type: "bytes32[]" },
    ],
    outputs: [],
  },
] as const;

const ownerOfAbi = [
  {
    type: "function",
    name: "ownerOf",
    stateMutability: "view",
    inputs: [{ name: "tokenId", type: "uint256" }],
    outputs: [{ name: "owner", type: "address" }],
  },
] as const;

type LoadState = "idle" | "loading" | "ready" | "error";

const COLLECTION_SIZE = 5_200;
const GALLERY_BATCH_SIZE = 180;
const BACKDROP_IDS = Array.from(
  { length: 48 },
  (_, index) => ((index * 109 + 241) % COLLECTION_SIZE) + 1,
);

function nftImageUrl(tokenId: number) {
  return `https://cats-cdn.superposition.so/${tokenId}.png`;
}

function CollectionBackdrop() {
  return (
    <div className="collection-backdrop" aria-hidden="true">
      <div className="backdrop-grid">
        {BACKDROP_IDS.map((tokenId, index) => (
          <img
            key={tokenId}
            src={nftImageUrl(tokenId)}
            alt=""
            decoding="async"
            loading={index < 24 ? "eager" : "lazy"}
          />
        ))}
      </div>
      <div className="backdrop-shade" />
    </div>
  );
}

function shorten(value: string, head = 6, tail = 4) {
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function BrandMark() {
  return (
    <svg viewBox="0 0 500 500" role="img" aria-label="Superposition">
      <path d="M500 0H0v500h91.2l73.5-104.7c13.4-19.1 20.7-42.5 20.7-66.5V173.5c0-5.9 6.6-8.8 10.4-4.6l43.9 56.7h81l48.3-57.7c3.9-3.9 10.3-.9 10.3 4.8v151.4L381 500h119z" />
      <path className="brand-cutout" d="M379.3 173.4c0-5.7-6.4-8.7-10.3-4.8l-48.3 57.1h-81l-43.9-56.1c-3.8-4.1-10.4-1.2-10.4 4.6V328c0 23.8-7.3 47-20.7 65.9L91.2 497.6h289.7l-1.7-174.2z" />
    </svg>
  );
}

function TokenCard({
  item,
  busy,
  pending,
  claimedInSession,
  wrongNetwork,
  onClaim,
}: {
  item: ClaimProof;
  busy: boolean;
  pending: boolean;
  claimedInSession: boolean;
  wrongNetwork: boolean;
  onClaim: (item: ClaimProof) => void;
}) {
  const { data: onchainOwner } = useReadContract({
    address: SUPERCATS_ADDRESS,
    abi: ownerOfAbi,
    functionName: "ownerOf",
    args: [BigInt(item.token_id)],
    chainId: superposition.id,
    query: { retry: false },
  });
  const claimed = claimedInSession || Boolean(onchainOwner);

  return (
    <article className="token-card">
      <img
        src={nftImageUrl(item.token_id)}
        alt={`Supercat #${item.token_id}`}
      />
      <div className="token-meta">
        <div>
          <span>{claimed ? "Already claimed" : "Supercat"}</span>
          <strong>#{item.token_id}</strong>
        </div>
        <button type="button" disabled={busy || claimed} onClick={() => onClaim(item)}>
          {claimed ? "Claimed ✓" : pending ? "Claiming…" : wrongNetwork ? "Switch & claim" : "Claim"}
        </button>
      </div>
    </article>
  );
}

export function SupercatsClaims() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, error: connectError, isPending: isConnecting } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChainAsync, isPending: isSwitching } = useSwitchChain();
  const publicClient = usePublicClient({ chainId: superposition.id });
  const { writeContractAsync } = useWriteContract();

  const [proofs, setProofs] = useState<ClaimProof[]>([]);
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [activeToken, setActiveToken] = useState<number>();
  const [claimedTokens, setClaimedTokens] = useState<Set<number>>(() => new Set());
  const [transactionHash, setTransactionHash] = useState<Hash>();
  const [flowError, setFlowError] = useState<string>();
  const [galleryCount, setGalleryCount] = useState(GALLERY_BATCH_SIZE);
  const gallerySentinelRef = useRef<HTMLDivElement>(null);
  const accountLifecycleRef = useRef(0);
  const previousAddressRef = useRef(address);
  if (previousAddressRef.current?.toLowerCase() !== address?.toLowerCase()) {
    previousAddressRef.current = address;
    accountLifecycleRef.current += 1;
  }

  useEffect(() => {
    let cancelled = false;
    if (!address) {
      setProofs([]);
      setLoadState("idle");
      return;
    }
    setLoadState("loading");
    fetch("/proofs.json")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load claim proofs.");
        return response.json() as Promise<unknown>;
      })
      .then((value) => validateClaimItems(value))
      .then((items) => {
        if (cancelled) return;
        setProofs(items);
        setLoadState("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setLoadState("error");
        setFlowError(error instanceof Error ? error.message : "Unable to load claim proofs.");
      });
    return () => { cancelled = true; };
  }, [address]);

  useEffect(() => {
    setActiveToken(undefined);
    setClaimedTokens(new Set());
    setTransactionHash(undefined);
    setFlowError(undefined);
  }, [address]);

  useEffect(() => {
    const sentinel = gallerySentinelRef.current;
    if (!sentinel || galleryCount >= COLLECTION_SIZE) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setGalleryCount((count) => Math.min(count + GALLERY_BATCH_SIZE, COLLECTION_SIZE));
      },
      { rootMargin: "1200px 0px" },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [galleryCount]);

  const eligibleClaims = useMemo(
    () => address ? findClaimsForAddress(proofs, address) : [],
    [address, proofs],
  );

  async function claim(item: ClaimProof) {
    if (!address) return;
    const claimAccount = address;
    const claimLifecycle = ++accountLifecycleRef.current;
    const isCurrentAccount = () =>
      accountLifecycleRef.current === claimLifecycle &&
      previousAddressRef.current?.toLowerCase() === claimAccount.toLowerCase();
    const assertCurrentAccount = () => {
      if (!isCurrentAccount()) throw new Error("The connected wallet changed. Start the claim again.");
    };

    setActiveToken(item.token_id);
    setFlowError(undefined);
    setTransactionHash(undefined);
    try {
      if (chainId !== superposition.id) {
        await switchChainAsync({ chainId: superposition.id });
      }
      assertCurrentAccount();
      const [account, tokenId, merkleProof] = toClaimArgs(item, claimAccount);
      if (!publicClient) throw new Error("Superposition RPC is unavailable.");
      await publicClient.simulateContract({
        account: account as Address,
        address: SUPERCATS_ADDRESS,
        abi: claimAbi,
        functionName: "claim",
        args: [account as Address, tokenId, merkleProof],
      });
      assertCurrentAccount();
      const hash = await writeContractAsync({
        account: claimAccount,
        address: SUPERCATS_ADDRESS,
        abi: claimAbi,
        functionName: "claim",
        args: [account as Address, tokenId, merkleProof],
        chainId: superposition.id,
      });
      if (isCurrentAccount()) setTransactionHash(hash);
      let replacementReason: "repriced" | "cancelled" | "replaced" | undefined;
      const receipt = await publicClient.waitForTransactionReceipt({
        hash,
        onReplaced(replacement) {
          replacementReason = replacement.reason;
          if (isCurrentAccount()) setTransactionHash(replacement.transaction.hash);
        },
      });
      if (!isCurrentAccount()) return;
      if (replacementReason === "cancelled") throw new Error("The claim transaction was cancelled.");
      if (replacementReason === "replaced") throw new Error("The claim transaction was replaced.");
      if (receipt.status !== "success") throw new Error("The claim transaction reverted.");
      setClaimedTokens((current) => new Set(current).add(item.token_id));
    } catch (error) {
      if (isCurrentAccount()) {
        setFlowError(error instanceof Error ? error.message : "The claim was not completed.");
      }
    } finally {
      if (isCurrentAccount()) setActiveToken(undefined);
    }
  }

  const connector = connectors[0];
  const isBusy = activeToken !== undefined || isSwitching;

  return (
    <main className="shell">
      <section className="collection-hero">
        <CollectionBackdrop />
        <header className="site-header">
        <a className="brand" href="https://superposition.so" target="_blank" rel="noreferrer">
          <span className="brand-mark"><BrandMark /></span>
          <span>Superposition</span>
        </a>
        {isConnected && address ? (
          <button className="account-button" type="button" onClick={() => disconnect()}>
            {shorten(address)} <span>Disconnect</span>
          </button>
        ) : null}
      </header>

      <section className="claim-section" aria-labelledby="claim-title">
        <div className="claim-panel">
          <div className="claim-intro">
            <p className="eyebrow">Supercats claims</p>
            <h1 id="claim-title">Claim your Supercats</h1>
            <p>Connect the wallet that held your Supercats to check your allocation and claim.</p>
          </div>

          {!isConnected ? (
            <div className="connect-state">
              <button
                className="primary-button"
                type="button"
                disabled={!connector || isConnecting}
                onClick={() => connector && connect({ connector })}
              >
                <span>{isConnecting ? "Connecting…" : connector ? "Connect wallet" : "Install a browser wallet"}</span>
                <span aria-hidden="true">→</span>
              </button>
              <small>Your wallet choice will be remembered on this device.</small>
              {connectError ? <p className="error" role="alert">{connectError.message}</p> : null}
            </div>
          ) : (
            <div className="connected-state">
              <div className="wallet-row">
                <span>Connected wallet</span>
                <code>{address}</code>
                <span className={chainId === superposition.id ? "network ready" : "network"}>
                  {chainId === superposition.id ? "Superposition" : "Network switch required"}
                </span>
              </div>

              {loadState === "loading" ? (
                <div className="status"><span className="spinner" /> Checking eligibility…</div>
              ) : loadState === "error" ? (
                <div className="status error">Claim proofs could not be loaded. Refresh to try again.</div>
              ) : loadState === "ready" && eligibleClaims.length === 0 ? (
                <div className="empty-state">
                  <h2>No Supercats found</h2>
                  <p>This wallet does not appear in the claim snapshot.</p>
                </div>
              ) : loadState === "ready" ? (
                <div className="eligible-state">
                  <div className="eligibility-heading">
                    <div><span>Eligible tokens</span><strong>{eligibleClaims.length.toString().padStart(2, "0")}</strong></div>
                    <p>Each token is claimed in a separate transaction.</p>
                  </div>
                  <div className="token-grid">
                    {eligibleClaims.map((item) => (
                      <TokenCard
                        key={item.token_id}
                        item={item}
                        busy={isBusy}
                        pending={activeToken === item.token_id}
                        claimedInSession={claimedTokens.has(item.token_id)}
                        wrongNetwork={chainId !== superposition.id}
                        onClaim={(claimItem) => void claim(claimItem)}
                      />
                    ))}
                  </div>
                </div>
              ) : null}

              {transactionHash ? (
                <a className="transaction" href={`${superposition.blockExplorers.default.url}/tx/${transactionHash}`} target="_blank" rel="noreferrer">
                  View transaction {shorten(transactionHash, 10, 8)} ↗
                </a>
              ) : null}
              {flowError ? <p className="error flow-error" role="alert">{flowError}</p> : null}
            </div>
          )}
        </div>
      </section>
      </section>

      <section className="collection-story" aria-labelledby="collection-title">
        <p className="story-index">Supercats / 5,200</p>
        <div className="story-layout">
          <div className="story-copy">
            <h2 id="collection-title">The ticket to the Superposition ecosystem</h2>
            <p>Supercats is a NFT collection previously deployed on Superposition Mainnet. 5200 hand drawn combined NFTs.</p>
          </div>
          <div className="ecosystem-grid" aria-label="Projects in the Superposition ecosystem">
            <a className="ecosystem-project" href="https://9lives.so" target="_blank" rel="noreferrer">
              <span className="project-number">01</span>
              <img src="/ecosystem/9lives.svg" alt="9Lives" />
              <span className="project-name">9Lives <span aria-hidden="true">↗</span></span>
            </a>
            <a className="ecosystem-project" href="https://florin.so" target="_blank" rel="noreferrer">
              <span className="project-number">02</span>
              <img src="/ecosystem/florin.svg" alt="Florin" />
              <span className="project-name">Florin <span aria-hidden="true">↗</span></span>
            </a>
            <a className="ecosystem-project ecosystem-project-wide" href="https://superposition.so" target="_blank" rel="noreferrer">
              <span className="project-number">03</span>
              <img src="/ecosystem/superposition.svg" alt="Superposition" />
              <span className="project-name">Superposition <span aria-hidden="true">↗</span></span>
            </a>
          </div>
        </div>
      </section>

      <section className="collection-gallery-section" aria-label="The complete Supercats collection">
        <div className="gallery-heading">
          <p>Every Supercat</p>
          <span>0001 — 5200</span>
        </div>
        <div className="collection-gallery">
          {Array.from({ length: galleryCount }, (_, index) => {
            const tokenId = index + 1;
            return (
              <figure className="collection-tile" key={tokenId}>
                <img
                  src={nftImageUrl(tokenId)}
                  alt={`Supercat #${tokenId}`}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption>#{tokenId.toString().padStart(4, "0")}</figcaption>
              </figure>
            );
          })}
        </div>
        <div ref={gallerySentinelRef} className="gallery-sentinel" aria-hidden="true" />
      </section>
    </main>
  );
}

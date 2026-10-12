#![cfg_attr(target_arch = "wasm32", no_std, no_main)]

use bobcat_sdk::prelude::*;

mod storage;

type Entry = libsupercats::Eip721MetadataDataSlice<1000, 100>;

use const_hex::display as hex_display;

const MERKLE_PROOF_ROOT: U =
    U::const_from_hex(b"67c52ca4ef45d254908c898576d9f9bddb8094c25f863dfc2bb66bc9b01ee301").unwrap();

const CDN_URI_CATS: &'static str = "https://cats-cdn.superposition.so/";

fn assert_can_transfer(from: &[u8; 20], to: &[u8; 20], token_id: &U, mint: bool) -> [u8; 20] {
    let owner: [u8; 20] = storage::owner_of::get(token_id).into();
    assert_eq!(
        &owner,
        from,
        "from {} not owner of token id {token_id}",
        hex_display(from)
    );
    assert_ne!(to, &[0u8; 20], "to target is a zero address");
    let sender = msg_sender();
    if !mint {
        if &sender != from
            && storage::approval::get(token_id).addr() != sender
            && !storage::approved_for_all::get(from, sender).is_some()
        {
            panic!("token id {token_id} sender is not approved");
        }
    }
    sender
}

const TOPIC_TRANSFER: U = const_keccak256(b"Transfer(address,address,uint256)");
const TOPIC_APPROVAL: U = const_keccak256(b"Approval(address,address,uint256)");
const TOPIC_APPROVAL_FOR_ALL: U = const_keccak256(b"ApprovalForAll(address,address,bool)");

fn transfer_from(from: [u8; 20], to: [u8; 20], token_id: U, mint: bool) -> [u8; 20] {
    let sender = assert_can_transfer(&from, &to, &token_id, mint);
    if from != [0u8; 20] {
        storage::balance::decr(from);
    }
    storage::balance::incr(to);
    storage::owner_of::set(token_id, to);
    storage::approval::set(token_id, &U::ZERO);
    emit!(TOPIC_TRANSFER, from, to, token_id);
    sender
}

const ERC721_CB_SEL: [u8; 4] = const_keccak_sel(b"onERC721Received(address,address,uint256,bytes)");

#[derive(Debug, Clone, EvmCdSerialise)]
#[evm_selector]
enum Erc721Cb<const DATA_CAP: usize> {
    #[evm_selector("onERC721Received(address,address,uint256,bytes)")]
    OnErc721Received {
        operator: EvmCdAddress,
        from: EvmCdAddress,
        token_id: U,
        bytes: EvmCdBytes<DATA_CAP>,
    },
}

fn safe_transfer<const DATA_CAP: usize>(
    from: [u8; 20],
    to: [u8; 20],
    token_id: U,
    data: [u8; DATA_CAP],
    data_len: usize,
) {
    let sender = transfer_from(from, to, token_id, false);
    if addr_has_code(to) {
        unsafe { flush_cache() };
        let (rc, rd) = call_word(
            to,
            &Erc721Cb::OnErc721Received {
                operator: EvmCdAddress::new(sender),
                from: EvmCdAddress::new(from),
                token_id,
                bytes: EvmCdBytes::<_> {
                    len: data_len,
                    bytes: data,
                },
            }
            .to_evm_array::<DATA_CAP>()
            .unwrap(),
            &U::ZERO,
            u64::MAX,
            0,
        );
        assert!(rc, "callback check failed");
        let mut exp = U::ZERO;
        exp.0[..4].copy_from_slice(&ERC721_CB_SEL);
        assert_eq!(exp, rd, "selector not equal");
    }
}

fn approve(spender: [u8; 20], id: U) {
    let owner = storage::owner_of::get(id).addr();
    let sender = msg_sender();
    assert_ne!(owner, spender, "spender == owner during approval");
    if sender != owner {
        assert!(
            storage::approved_for_all::get(owner, sender).is_some(),
            "not authorised"
        );
    }
    storage::approval::set(id, spender);
    emit!(TOPIC_APPROVAL, owner, spender, id)
}

fn set_approval_for_all(operator: [u8; 20], approved: bool) {
    let sender = msg_sender();
    assert_ne!(sender, operator, "spender == operator in approvalForALl");
    storage::approved_for_all::set(sender, operator, approved);
    emit!(
        TOPIC_APPROVAL_FOR_ALL,
        sender,
        operator,
        data: U::from(approved),
        32
    );
}

const DATA_CAP: usize = 1188;

fn entry(entry: Entry) {
    match entry {
        Entry::Claim {
            account,
            token_id,
            merkle_proof,
        } => flush_guard(|| {
            let mut pre = [0u8; 64];
            pre[28..32].copy_from_slice(&token_id.to_be_bytes());
            pre[44..64].copy_from_slice(&account.0);
            let hash = keccak256(&keccak256(&pre).0);
            assert!(
                stylus_merkle_proof_verifier::verify(
                    &merkle_proof.as_slice(),
                    MERKLE_PROOF_ROOT,
                    hash
                ),
                "proof not verified"
            );
            storage::verified_hashes::exchange(hash);
            assert!(storage::owner_of::get(token_id).is_zero(), "token already claimed");
            transfer_from([0u8; 20], account.0, token_id.into(), true);
        }),
        Entry::Name => write_str("Superposition Supercats"),
        Entry::Symbol => write_str("SPN CATS"),
        Entry::TokenUri { token_id } => {
            const URI_LEN: usize = 34;
            const TOKEN_ID_LEN: usize = 78;
            const TOKEN_URI_CAP: usize = URI_LEN + TOKEN_ID_LEN + 5;
            assert_ne!(
                [0u8; 20],
                storage::owner_of::get(token_id).addr(),
                "{token_id} not minted"
            );
            let mut buf = [0u8; TOKEN_URI_CAP];
            buf[..URI_LEN].copy_from_slice(CDN_URI_CATS.as_bytes());
            let (token_str, token_str_len) = token_id.str_slice();
            buf[URI_LEN..URI_LEN + token_str_len].copy_from_slice(&token_str[..token_str_len]);
            buf[URI_LEN+token_str_len..URI_LEN + token_str_len + 5].copy_from_slice(b".json");
            let len = URI_LEN + token_str_len + 5;
            let uri = unsafe { core::str::from_utf8_unchecked(&buf[..len]) };
            write_str(uri)
        }
        Entry::BalanceOf { owner } => {
            assert_ne!([0u8; 20], owner.0, "owner zero address");
            write_word(&storage::balance::get(&owner.into_array()))
        }
        Entry::OwnerOf { token_id } => {
            let owner = storage::owner_of::get(&token_id);
            assert_ne!([0u8; 20], owner.addr(), "{token_id} not minted");
            write_word(&owner)
        }
        Entry::GetApproved { token_id } => {
            assert_ne!(
                [0u8; 20],
                storage::owner_of::get(token_id).addr(),
                "{token_id} not minted"
            );
            write_word(&storage::approval::get(token_id))
        }
        Entry::IsApprovedForAll { owner, operator } => {
            write_word(&storage::approved_for_all::get(owner.0, operator.0))
        }
        Entry::SupportsInterface { interface_id } => write_word(&U::from(matches!(
            interface_id,
            [0x01, 0xff, 0xc9, 0xa7] | [0x80, 0xac, 0x58, 0xcd] | [0x5b, 0x5e, 0x13, 0x9f]
        ))),
        Entry::SafeTransferFrom { from, to, token_id } => {
            flush_guard(|| safe_transfer(from.into(), to.into(), token_id, [0u8; DATA_CAP], 0))
        }
        Entry::SafeTransferFromWithData {
            from,
            to,
            token_id,
            data,
        } => flush_guard(|| safe_transfer(from.into(), to.into(), token_id, data.bytes, data.len)),
        Entry::TransferFrom { from, to, token_id } => {
            flush_guard(|| transfer_from(from.into(), to.into(), token_id, false));
        }
        Entry::Approve { approved, token_id } => flush_guard(|| approve(approved.into(), token_id)),
        Entry::SetApprovalForAll { operator, approved } => {
            flush_guard(|| set_approval_for_all(operator.into(), approved))
        }
    }
}

#[unsafe(no_mangle)]
fn user_entrypoint(len: usize) -> usize {
    entry(read_cd::<Entry>(len));
    0
}

#[cfg(not(target_arch = "wasm32"))]
fn main() {}

#[cfg(test)]
mod test {
    use super::*;

    use serde::Deserialize as SerdeDeserialize;

    const ITEMS: &'static str = include_str!("../proofs.json");

    #[derive(Clone, PartialEq, SerdeDeserialize)]
    struct Item {
        token_id: u32,
        #[serde(deserialize_with = "const_hex::deserialize")]
        owner: [u8; 20],
        #[serde(deserialize_with = "deserialize_proof")]
        proof: Vec<[u8; 32]>,
    }

    fn deserialize_proof<'de, D>(d: D) -> Result<Vec<[u8; 32]>, D::Error>
    where
        D: serde::Deserializer<'de>,
    {
        let values = Vec::<String>::deserialize(d)?;
        values
            .into_iter()
            .map(|s| const_hex::decode_to_array::<_, 32>(&s).map_err(serde::de::Error::custom))
            .collect()
    }

    #[test]
    fn test_all_claims() {
        for Item {
            token_id,
            owner,
            proof,
        } in serde_json::from_str::<Vec<Item>>(ITEMS).unwrap()
        {
            entry(Entry::Claim {
                account: EvmCdAddress(owner),
                token_id,
                merkle_proof: EvmCdArray::try_from_slice(
                    &proof.into_iter().map(U).collect::<Vec<_>>(),
                )
                .unwrap(),
            });
            entry(Entry::TokenUri { token_id: U::from(token_id) })
        }
    }
}

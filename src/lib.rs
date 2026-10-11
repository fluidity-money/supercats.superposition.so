#![no_std]

use bobcat_sdk::cd::{EvmCdAddress, EvmCdArray, EvmCdBytes, EvmCdDeserialise, EvmCdSerialise, U};

#[derive(Debug, Clone, PartialEq, EvmCdSerialise, EvmCdDeserialise)]
#[evm_selector]
pub enum Eip721MetadataDataSlice<const MAX_DATA: usize, const MAX_MERKLE_PROOF: usize> {
    Claim {
        account: EvmCdAddress,
        token_id: u32,
        merkle_proof: EvmCdArray<U, 0, MAX_MERKLE_PROOF>,
    },
    BalanceOf {
        owner: EvmCdAddress,
    },
    OwnerOf {
        token_id: U,
    },
    SafeTransferFrom {
        from: EvmCdAddress,
        to: EvmCdAddress,
        token_id: U,
    },
    #[evm_selector("safeTransferFrom(address,address,uint256,bytes)")]
    SafeTransferFromWithData {
        from: EvmCdAddress,
        to: EvmCdAddress,
        token_id: U,
        data: EvmCdBytes<MAX_DATA>,
    },
    TransferFrom {
        from: EvmCdAddress,
        to: EvmCdAddress,
        token_id: U,
    },
    Approve {
        approved: EvmCdAddress,
        token_id: U,
    },
    SetApprovalForAll {
        operator: EvmCdAddress,
        approved: bool,
    },
    GetApproved {
        token_id: U,
    },
    IsApprovedForAll {
        owner: EvmCdAddress,
        operator: EvmCdAddress,
    },
    Name,
    Symbol,
    SupportsInterface {
        interface_id: [u8; 4],
    },
    #[evm_selector("tokenURI(uint256)")]
    TokenUri {
        token_id: U,
    },
}

// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title IAPass
/// @notice Minimal interface for the deployed Cleanverse A-Pass (CVI) identity registry.
/// @dev Monad testnet (chainId 10143): 0xbA82D189540CaC9DC6FF46B6837CaC1BFdEC58B9
///      ERC-1967 proxy; implementation 0x9406F5d46268EE6617f7AB28ed8AE0767d3415a3.
///      An ERC-721 whose token id encodes the holder's credential. On EVM chains the
///      holder's wallet address identifies the A-Pass (per Cleanverse API docs v5.6).
///
///      Verified live 2026-08-08 against holder 0x5702b24116718DCF49314231222A33403e88Aff8:
///      balanceOf == 1, getTokenId returns a non-zero id.
interface IAPass {
    /// @notice Token id of the A-Pass held by `holder`.
    /// @dev Reverts for addresses that hold no A-Pass. Call sites must use try/catch
    ///      or gate on balanceOf first.
    function getTokenId(address holder) external view returns (uint256 tokenId);

    /// @notice Number of A-Passes held. Zero means the address carries no credential.
    function balanceOf(address holder) external view returns (uint256);

    /// @notice Current owner of an A-Pass token id.
    function ownerOf(uint256 tokenId) external view returns (address);
}

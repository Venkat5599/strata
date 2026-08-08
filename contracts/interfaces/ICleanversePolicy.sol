// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// @title ICleanversePolicy
/// @notice Minimal interface for the deployed Cleanverse Policy (Validator) contract.
/// @dev Monad testnet (chainId 10143): 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd
///      ERC-1967 proxy; implementation 0xc644e79E4C8ee94C4DEE49b76f8591e994E58101.
///
///      Hand-written from on-chain introspection of the implementation bytecode
///      (PUSH4 selector extraction resolved against the openchain signature database)
///      plus live eth_call probes against Monad testnet on 2026-08-08.
///      Only the functions STRATA actually calls are declared.
///
///      IMPORTANT - canTransfer reverts, it does not return false.
///      Probed live: a party holding no A-Pass causes a revert carrying selector
///      0xa6725971 with that party's address as the sole argument. A registered,
///      A-Pass-holding pair returns true. Every STRATA call site MUST therefore wrap
///      canTransfer in try/catch - see StrataPool._policyClears.
///      Converting that revert into a graded outcome is the whole point of STRATA.
interface ICleanversePolicy {
    /// @notice Compliance predicate for moving `amount` of `token` between two parties.
    /// @param token A-Token being moved. MUST be registered or the call reverts with
    ///        TokenNotRegistered() (0x259ba1ad) - verified live against USDC and a random address.
    /// @param from Sending party. Zero address is exempt (mint path) - verified live.
    /// @param to Receiving party. Zero address is exempt (burn path) - verified live.
    /// @param amount Transfer amount.
    /// @return allowed True when the transfer satisfies every rule bound to `token`.
    /// @dev `from` and `to` are validated symmetrically: probes swapping a pass-holder and a
    ///      non-holder revert identically, naming the non-holder either way. The declared
    ///      parameter order follows the ERC-3643 convention; STRATA's correctness does not
    ///      depend on it, because it only ever asks whether a single redeemer clears.
    function canTransfer(address token, address from, address to, uint256 amount)
        external
        view
        returns (bool allowed);

    /// @notice Whether a specific holder is frozen for a specific token.
    /// @dev This is the on-chain revocation signal that drives STRATA's Blocked branch.
    function isFrozen(address token, address holder) external view returns (bool frozen);

    /// @notice Whether all transfers of `token` are paused at the policy level.
    function isPaused(address token) external view returns (bool paused);

    /// @notice Whether `token` is a registered A-Token known to the policy engine.
    function isTokenRegistered(address token) external view returns (bool registered);

    /// @notice Address of the A-Pass (CVI) ERC-721 registry this policy reads identity from.
    /// @dev Verified live to equal the apass_address returned by the Cleanverse REST API.
    function apass() external view returns (address);
}

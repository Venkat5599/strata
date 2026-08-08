// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DemoUSDC
/// @notice A freely-mintable, 6-decimal test dollar for the STRATA demo pool on Monad testnet.
/// @dev The real testnet USDC has no open mint and the Cleanverse faucet is dry, so a demo
///      dollar is used as the POOLED asset. This changes nothing about the compliance layer:
///      the pool still reads the real Cleanverse Policy and A-Pass for every stratum decision.
///      Only the unit of account is a testnet mint, which is honest for a testnet.
contract DemoUSDC is ERC20 {
    constructor() ERC20("STRATA Demo USDC", "dUSDC") {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    /// @notice Open mint for demo populating. Testnet only.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}

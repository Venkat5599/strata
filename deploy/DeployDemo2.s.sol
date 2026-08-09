// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../contracts/StrataPool.sol";
import {DemoUSDC} from "../contracts/mocks/DemoUSDC.sol";
import {ICleanversePolicy} from "../contracts/interfaces/ICleanversePolicy.sol";

/// @notice Deploys the reviewer-facing demo pool with a key the team holds, reusing the
///         already-live DemoUSDC (0x16CAf4...) as the pooled asset. The pool is then
///         registered as a Cleanverse Validator (owner signature from DEPLOYER_PRIVATE_KEY),
///         and seeded with real on-chain liquidity in both strata.
/// @dev    Run: DEPLOYER_PRIVATE_KEY=... forge script deploy/DeployDemo2.s.sol --broadcast
contract DeployDemo2 is Script {
    address internal constant AUSDC  = 0xaC0893567D43C3E7e6e35a72803df05416C1f20D;
    address internal constant POLICY = 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd;
    address internal constant DUSDC  = 0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242;

    function run() external returns (StrataPool pool) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 10143, "not Monad testnet");

        vm.startBroadcast(pk);
        pool = new StrataPool(IERC20(DUSDC), IERC20(AUSDC), ICleanversePolicy(POLICY), deployer);

        // Seed VERIFIED (deployer holds an A-Pass -> tier >= minTier) and OPEN via a
        // fresh anonymous address whose A-Pass is absent (deposit assigns by credential).
        address anon = vm.addr(vm.envUint("SEED_ANON_PRIVATE_KEY"));
        DemoUSDC(DUSDC).mint(deployer, 250_000e6);
        DemoUSDC(DUSDC).mint(anon, 150_000e6);

        IERC20(DUSDC).approve(address(pool), 250_000e6);
        pool.deposit(250_000e6);
        vm.stopBroadcast();

        // OPEN stratum needs the anon address to deposit; broadcast as anon.
        vm.startBroadcast(vm.envUint("SEED_ANON_PRIVATE_KEY"));
        IERC20(DUSDC).approve(address(pool), 150_000e6);
        pool.deposit(150_000e6);
        vm.stopBroadcast();

        console.log("StrataPool :", address(pool));
        console.log("deployer   :", deployer);
        console.log("OPEN       :", pool.stratumTotalShares(0));
        console.log("VERIFIED   :", pool.stratumTotalShares(1));
    }
}

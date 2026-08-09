// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../contracts/StrataPool.sol";
import {ICleanversePolicy} from "../contracts/interfaces/ICleanversePolicy.sol";

/// @notice Deploys the fully-live STRATA pool whose A-Token is our OWN Cleanverse
///         CVA (launched via /atoken/launch, "STRATA CVA" sCVA). This is the
///         Cleanverse-sanctioned path (issuing your own CVA is permitted): the
///         pool custodies a real registered A-Token, no demo caveat.
///
///         The pool's own A-Pass must be minted BEFORE any depositAToken (a
///         contract without a credential cannot receive an A-Token - see README
///         "Why the pool takes both dUSDC and aUSDC"). So this script only
///         deploys; seeding happens in SeedDemo3.s.sol after the A-Pass lands.
///
/// @dev    DEPLOYER_PRIVATE_KEY=... forge script deploy/DeployDemo3.s.sol --broadcast
contract DeployDemo3 is Script {
    address internal constant POLICY = 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd;
    address internal constant DUSDC = 0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242;

    function run() external returns (StrataPool pool) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 10143, "not Monad testnet");

        // Our Cleanverse CVA, launched via /atoken/launch, registered in Policy.
        address atoken = vm.envAddress("SEED_ATOKEN_ADDRESS");

        vm.startBroadcast(pk);
        pool = new StrataPool(IERC20(DUSDC), IERC20(atoken), ICleanversePolicy(POLICY), deployer);
        vm.stopBroadcast();

        console.log("StrataPool :", address(pool));
        console.log("atoken     :", atoken);
        console.log("deployer   :", deployer);
        console.log("NEXT: mint the pool's A-Pass (tools/mint-apass.mjs), then run SeedDemo3");
    }
}

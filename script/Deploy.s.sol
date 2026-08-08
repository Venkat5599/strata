// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../src/StrataPool.sol";
import {ICleanversePolicy} from "../src/interfaces/ICleanversePolicy.sol";

/// @notice Deploys StrataPool to Monad testnet against the live Cleanverse contracts.
/// @dev forge script script/Deploy.s.sol --rpc-url $MONAD_RPC_URL --broadcast
contract Deploy is Script {
    // Live Monad testnet (chainId 10143). Sourced from the Cleanverse REST API
    // /query_deposit_atoken_list and confirmed by direct eth_call.
    address internal constant USDC = 0x534b2f3A21130d7a60830c2Df862319e593943A3;
    address internal constant AUSDC = 0xaC0893567D43C3E7e6e35a72803df05416C1f20D;
    address internal constant POLICY = 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd;

    function run() external returns (StrataPool pool) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);

        require(block.chainid == 10143, "Deploy: not Monad testnet");

        vm.startBroadcast(pk);
        // Pooled asset is plain USDC so any party may hold it; aUSDC is the registered
        // A-Token the policy questions are denominated in. See StrataPool natspec.
        pool = new StrataPool(IERC20(USDC), IERC20(AUSDC), ICleanversePolicy(POLICY), deployer);
        vm.stopBroadcast();

        console.log("StrataPool:", address(pool));
        console.log("owner     :", deployer);
        console.log("asset     :", USDC);
        console.log("ref       :", AUSDC);
        console.log("policy    :", POLICY);
        console.log("basis bps :", uint256(int256(pool.basis(1, 0))));
    }
}

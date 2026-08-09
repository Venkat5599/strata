// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../contracts/StrataPool.sol";
import {DemoUSDC} from "../contracts/mocks/DemoUSDC.sol";

/// @notice Seeds the DeployDemo3 pool: VERIFIED via the REAL depositAToken path
///         (deployer holds sCVA + A-Pass; the pool holds its own A-Pass - both
///         required for the A-Token gate), OPEN via a plain dUSDC deposit from a
///         fresh anonymous wallet.
///
/// @dev    Requires the pool address + our CVA address:
///         DEPLOYER_PRIVATE_KEY=... SEED_ANON_PRIVATE_KEY=...
///         SEED_POOL=0x... SEED_ATOKEN_ADDRESS=0x...
///         forge script deploy/SeedDemo3.s.sol --broadcast
contract SeedDemo3 is Script {
    address internal constant DUSDC = 0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242;

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address pool = vm.envAddress("SEED_POOL");
        address atoken = vm.envAddress("SEED_ATOKEN_ADDRESS");
        require(block.chainid == 10143, "not Monad testnet");

        // ---- VERIFIED stratum: REAL depositAToken --------------------------
        // Deployer holds sCVA (minted, MINTER_ROLE granted) and an A-Pass; the
        // pool holds its own A-Pass (minted via tools/mint-apass.mjs). The
        // A-Token gate checks from AND to - both must clear.
        uint256 verifiedAmt = 250_000e6;
        vm.startBroadcast(pk);
        IERC20(atoken).approve(address(pool), verifiedAmt);
        pool.call(abi.encodeWithSignature("depositAToken(uint128)", verifiedAmt));
        vm.stopBroadcast();

        // ---- OPEN stratum: plain dUSDC deposit from an anonymous wallet -----
        address anon = vm.addr(vm.envUint("SEED_ANON_PRIVATE_KEY"));
        vm.startBroadcast(vm.envUint("SEED_ANON_PRIVATE_KEY"));
        DemoUSDC(DUSDC).mint(anon, 150_000e6);
        IERC20(DUSDC).approve(pool, 150_000e6);
        pool.call(abi.encodeWithSignature("deposit(uint128)", 150_000e6));
        vm.stopBroadcast();

        console.log("pool       :", pool);
        console.log("OPEN       :", StrataPool(pool).stratumTotalShares(0));
        console.log("VERIFIED   :", StrataPool(pool).stratumTotalShares(1));
        console.log("sCVA held  :", IERC20(atoken).balanceOf(pool));
    }
}

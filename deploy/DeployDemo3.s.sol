// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../contracts/StrataPool.sol";
import {DemoUSDC} from "../contracts/mocks/DemoUSDC.sol";
import {ICleanversePolicy} from "../contracts/interfaces/ICleanversePolicy.sol";

/// @notice Deploys the fully-live STRATA pool whose A-Token is the Cleanverse
///         WRAPPED version of our own dUSDC (launched via /atoken/launch_wrapped_atoken).
///         This is the "CVA custodied" path made real: depositAToken() takes the
///         registered A-Token (a dUSDC wrapper minted by the Cleanverse backend),
///         so the pool holds a real Cleanverse instrument — no demo caveat.
///
///         Seeding uses the REAL depositAToken path for the VERIFIED stratum
///         (deployer holds an A-Pass -> tier >= minTier), and a plain dUSDC
///         deposit for OPEN via a fresh anonymous wallet.
///
/// @dev    Requires the wrapped A-Token address (from the launch request status):
///         DEPLOYER_PRIVATE_KEY=... SEED_ANON_PRIVATE_KEY=... SEED_ATOKEN_ADDRESS=0x...
///         forge script deploy/DeployDemo3.s.sol --broadcast
contract DeployDemo3 is Script {
    address internal constant POLICY = 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd;
    address internal constant DUSDC = 0x16CAf4d60BED18C215d1708870Ecc3fD9b46c242;

    function run() external returns (StrataPool pool) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 10143, "not Monad testnet");

        // The Cleanverse-wrapped A-Token over dUSDC, minted by their backend
        // (launch_wrapped_atoken). Must be a real registered token.
        address atoken = vm.envAddress("SEED_ATOKEN_ADDRESS");

        vm.startBroadcast(pk);
        pool = new StrataPool(IERC20(DUSDC), IERC20(atoken), ICleanversePolicy(POLICY), deployer);

        // ---- VERIFIED stratum: REAL depositAToken path -------------------------
        // Deployer holds an A-Pass (tier >= minTier 1) so the wrapped A-Token
        // transfers to the pool and credits the VERIFIED stratum.
        // The wrapped A-Token's own supply is backend-minted; depositAToken
        // receives it from the deployer's balance.
        uint256 verifiedAmt = 250_000e6;
        IERC20(atoken).approve(address(pool), verifiedAmt);
        pool.depositAToken(verifiedAmt);
        vm.stopBroadcast();

        // ---- OPEN stratum: plain dUSDC deposit from an anonymous wallet -------
        address anon = vm.addr(vm.envUint("SEED_ANON_PRIVATE_KEY"));
        vm.startBroadcast(vm.envUint("SEED_ANON_PRIVATE_KEY"));
        DemoUSDC(DUSDC).mint(anon, 150_000e6);
        IERC20(DUSDC).approve(address(pool), 150_000e6);
        pool.deposit(150_000e6);
        vm.stopBroadcast();

        console.log("StrataPool :", address(pool));
        console.log("atoken     :", atoken);
        console.log("deployer   :", deployer);
        console.log("OPEN       :", pool.stratumTotalShares(0));
        console.log("VERIFIED   :", pool.stratumTotalShares(1));
        console.log("aTokenHeld :", IERC20(atoken).balanceOf(address(pool)));
    }
}

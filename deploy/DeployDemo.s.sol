// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {Script, console} from "forge-std/Script.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import {StrataPool} from "../contracts/StrataPool.sol";
import {DemoUSDC} from "../contracts/mocks/DemoUSDC.sol";
import {ICleanversePolicy} from "../contracts/interfaces/ICleanversePolicy.sol";

/// @notice Deploys the demo pool: a mintable demo dollar as the pooled asset, the REAL
///         Cleanverse aUSDC / Policy as the compliance layer. The compliance integration is
///         unchanged and fully real; only the pooled unit of account is a testnet mint,
///         because the real testnet USDC has no open mint and the Cleanverse faucet is dry.
contract DeployDemo is Script {
    address internal constant AUSDC = 0xaC0893567D43C3E7e6e35a72803df05416C1f20D;
    address internal constant POLICY = 0x36489bE45fa84f70a0c2BDB11D824Be608CB12Dd;

    function run() external returns (StrataPool pool, DemoUSDC token) {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        require(block.chainid == 10143, "not Monad testnet");

        vm.startBroadcast(pk);
        token = new DemoUSDC();
        pool = new StrataPool(IERC20(address(token)), IERC20(AUSDC), ICleanversePolicy(POLICY), deployer);
        token.mint(deployer, 5_000_000e6);
        vm.stopBroadcast();

        console.log("DemoUSDC :", address(token));
        console.log("StrataPool:", address(pool));
        console.log("deployer :", deployer);
        console.log("basis bps:", uint256(int256(pool.basis(1, 0))));
    }
}

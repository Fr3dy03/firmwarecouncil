// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {ReleaseGovernance} from "../src/ReleaseGovernance.sol";

/**
 * @notice Deploy ReleaseGovernance to a BOT Chain network.
 *
 * Bot Chain config (validated):
 *   mainnet : chainId 677, rpc https://rpc.botchain.ai
 *   testnet : chainId 968, rpc https://rpc.bohr.life
 *
 * Fund the burner EOA with tBOT/BOT from the official faucet:
 *   https://faucet.botchain.ai/basic  (testnet)
 *
 * Run:
 *   forge script script/Deploy.s.sol \
 *     --rpc-url https://rpc.bohr.life \
 *     --broadcast --verify-unstable
 */
contract DeployScript is Script {
    function setUp() public {}

    function run() external returns (address deployed) {
        uint256 deployerKey = vm.envUint("DEPLOY_PRIVATE_KEY");
        address manufacturerAddr = vm.envOr("GOV_MANUFACTURER", makeAddr("MANUFACTURER tutoring"));
        address securityAddr = vm.envOr("GOV_SECURITY_REVIEWER", makeAddr("SECURITY_REVIEWER"));
        address operatorAddr = vm.envOr("GOV_OPERATOR", makeAddr("OPERATOR"));
        address emergencyAddr = vm.envOr("GOV_EMERGENCY_ADMIN", makeAddr("EMERGENCY_ADMIN"));
        // ALSO register the backend keyring as signers so decision EIP-712
        // signatures verify on-chain during the demo (docs/Arch).
        address backendManufacturingSigner = vm.envOr("GOV_BACKEND_MANUFACTURER_VALIDATOR", address(0));
        address backendSecuritySigner = vm.envOr("GOV_BACKEND_SECURITY_VALIDATOR", address(0));
        address backendOperatorSigner = vm.envOr("GOV_BACKEND_OPERATOR_VALIDATOR", address(0));

        vm.startBroadcast(deployerKey);
        ReleaseGovernance gov = new ReleaseGovernance(
            manufacturerAddr,
            securityAddr,
            operatorAddr,
            emergencyAddr
        );
        if (backendManufacturingSigner != address(0)) {
            gov.registerSigner(backendManufacturingSigner, gov.MANUFACTURER_ROLE());
        }
        if (backendSecuritySigner != address(0)) {
            gov.registerSigner(backendSecuritySigner, gov.SECURITY_REVIEWER_ROLE());
        }
        if (backendOperatorSigner != address(0)) {
            gov.registerSigner(backendOperatorSigner, gov.OPERATOR_ROLE());
        }
        vm.stopBroadcast();

        console.log("ReleaseGovernance deployed at:", address(gov));
        console.log("Chain: %s", block.chainid);
        return address(gov);
    }
}

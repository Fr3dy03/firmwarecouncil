// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @dev Diagnostic only: exposes the EIP-712 helpers ReleaseGovernance uses, so a
 *      signature failure can be bisected on-chain (domainSeparator vs structHash
 *      vs ECDSA.recover). Never used by the product.
 */
contract ProbeDomain is EIP712 {
    using ECDSA for bytes32;

    bytes32 public constant APPROVAL_TYPEHASH =
        keccak256("Approval(bytes32 releaseId,uint8 decision,uint256 nonce,uint256 deadline)");

    constructor(string memory name, string memory version) EIP712(name, version) {}

    function domainSeparator() external view returns (bytes32) {
        return _domainSeparatorV4();
    }

    function structHash(bytes32 releaseId, uint8 decision, uint256 nonce, uint256 deadline)
        external pure returns (bytes32)
    {
        return keccak256(abi.encode(APPROVAL_TYPEHASH, releaseId, decision, nonce, deadline));
    }

    function digest(bytes32 ds, bytes32 sh) external pure returns (bytes32) {
        return MessageHashUtils.toTypedDataHash(ds, sh);
    }

    function recover(bytes32 sh, bytes calldata signature) external view returns (address) {
        return MessageHashUtils.toTypedDataHash(this.domainSeparator(), sh).recover(signature);
    }
}

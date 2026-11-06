// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";

/**
 * @title ReleaseGovernance
 * @notice On-chain mirror of the FirmwareCouncil multi-party firmware
 *         release approval workflow, deployed on BOT Chain (EVM-compatible).
 *
 *         Trust architecture:
 *           MANUFACTURER        proposes releases for its product lines.
 *           SECURITY_REVIEWER   performs the security review gate.
 *           OPERATOR            authorises canary/rollout, commits receipts.
 *           EMERGENCY_ADMIN     emergency pause + release revocation.
 *
 *         No single untrusted actor can authorise a release: rollout requires
 *         both a recorded security approval AND an operator authorisation.
 *         The contract holds digests only — firmware binaries never touch chain.
 */
contract ReleaseGovernance is AccessControl, Pausable, ReentrancyGuard, EIP712  {
    using ECDSA for bytes32;

    bytes32 public constant MANUFACTURER_ROLE = keccak256("MANUFACTURER_ROLE");
    bytes32 public constant SECURITY_REVIEWER_ROLE = keccak256("SECURITY_REVIEWER_ROLE");
    bytes32 public constant OPERATOR_ROLE = keccak256("OPERATOR_ROLE");
    bytes32 public constant EMERGENCY_ADMIN_ROLE = keccak256("EMERGENCY_ADMIN_ROLE");

    // ------------------------------------------------------------ structs

    struct ProductLine {
        bytes32 id;
        address manufacturer;
        bytes32 metadataHash;
        bool active;
    }

    struct Release {
        bytes32 releaseId;
        bytes32 productLineId;
        bytes32 versionHash;
        bytes32 manifestDigest;
        address manufacturer;
        uint64 createdAt;
        ReleaseStatus status;
    }

    enum ReleaseStatus {
        Proposed,          // 0  — awaiting security review
        SecurityApproved,  // 1  — security review passed
        OperatorApproved,  // 2  — operator authorised rollout
        CanaryOpen,        // 3
        CanaryPassed,      // 4
        RolloutRunning,    // 5
        Paused,            // 6
        Deployed,          // 7
        Rejected,          // 8
        Revoked,           // 9
        Superseded         // 10
    }

    enum Decision {
        Approve,        // 0
        Reject,         // 1
        RequestChanges  // 2
    }

    struct Approval {
        bytes32 releaseId;
        address approver;
        bytes32 role;               // role hash of the approver
        Decision decision;
        uint64 timestamp;
        bytes32 signatureDigest;    // keccak of the EIP-712 signature payload
    }

    struct Rollout {
        bytes32 releaseId;
        bytes32 rolloutPolicyHash;
        uint8 currentStage;
        bool paused;
        bool finalised;
    }

    struct Receipt {
        bytes32 releaseId;
        bytes32 receiptRoot;        // Merkle root over signed installation receipts
        uint32 count;
        uint64 updatedAt;
        bool onChain;
    }

    // ------------------------------------------------------------ storage

    bytes32[] private _productLineIds;
    mapping(bytes32 => ProductLine) public productLines;

    bytes32[] private _releaseIds;
    mapping(bytes32 => Release) public releases;
    mapping(bytes32 => bytes32) private _releaseKeyOfDigest; // releaseKey => releaseId

    mapping(bytes32 => Approval[]) public approvalsOf;
    mapping(bytes32 => mapping(address => bool)) public hasDecision; // release => approver
    mapping(bytes32 => mapping(address => uint256)) public consumedNonces;

    mapping(bytes32 => Rollout) public rollouts;
    mapping(bytes32 => Rollout) private _rolloutOfRelease;
    mapping(bytes32 => uint256) private _rolloutCounter;

    mapping(bytes32 => Receipt) public batchReceipts;

    mapping(address => bytes32) public signerRole;      // signer => role hash
    mapping(bytes32 => address[]) private _signersOfRole;

    mapping(bytes32 => Release) private _supersedesOf;  // releaseId => superseded-by (unavailable via public map, see getter)
    mapping(bytes32 => bytes32) private _successorOf;
    mapping(bytes32 => bytes32) private _successorOfKey; // releaseKey chain

    uint256 private _nonce;

    // ------------------------------------------------------------ events

    event ProductLineRegistered(bytes32 indexed id, address indexed manufacturer, bytes32 metadataHash);
    event ReleaseProposed(bytes32 indexed releaseId, bytes32 indexed productLineId, bytes32 versionHash, bytes32 manifestDigest, address indexed manufacturer);
    event ReleaseApproved(bytes32 indexed releaseId, address indexed approver, bytes32 role, bytes32 signatureDigest);
    event ReleaseRejected(bytes32 indexed releaseId, address indexed approver, Decision decision, bytes32 signatureDigest);
    /// @notice Global emergency pause (stops all state-changing governance actions).
    function emergencyPauseAll() external onlyRole(EMERGENCY_ADMIN_ROLE) whenNotPaused {
        _pause();
        emit EmergencyPaused(_msgSender());
    }

    function emergencyUnpause() external onlyRole(EMERGENCY_ADMIN_ROLE) whenPaused {
        _unpause();
        emit EmergencyUnpaused(_msgSender());
    }

    event ReleasePaused(bytes32 indexed releaseId, address indexed caller);
    event ReleaseResumed(bytes32 indexed releaseId, address indexed caller);
    event EmergencyPaused(address indexed caller);
    event EmergencyUnpaused(address indexed caller);

    event RolloutStarted(bytes32 indexed releaseId, bytes32 rolloutPolicyHash, uint8 stage);
    event RolloutAdvanced(bytes32 indexed releaseId, uint8 currentStage);
    event ReleaseRevoked(bytes32 indexed releaseId, address indexed caller);
    event BatchReceiptCommitted(bytes32 indexed releaseId, bytes32 receiptRoot, uint32 count);
    event CanaryOpened(bytes32 indexed releaseId, address indexed caller);
    event CanaryResultRecorded(bytes32 indexed releaseId, bool success);
    event RolloutAuthorised(bytes32 indexed releaseId);
    event SignerRegistered(address indexed signer, bytes32 role);
    event SignerRevoked(address indexed signer);
    event ReleaseSuperseded(bytes32 indexed releaseId, bytes32 indexed successorId);

    // ------------------------------------------------------------ errors

    error NotProductLineOwner();
    error ProductLineInactive();
    error ReleaseNotFound(bytes32 releaseId);
    error ReleaseVersionCollision();
    error ReleaseNotAuthorised(bytes32 releaseId);
    error WrongPhase(bytes32 releaseId, uint8 currentStatus);
    error BadSignature(bytes32 releaseId, bytes sig);
    error DuplicateDecision(bytes32 releaseId, address approver);
    error NotAuthorisedForStage(uint8 current, uint8 requested);
    error ReceiptsNotFinalised();
    error AlreadySuperseded();

    // ------------------------------------------------------------ eip-712

    bytes32 private constant _APPROVAL_TYPEHASH =
        keccak256("Approval(bytes32 releaseId,uint8 decision,uint256 nonce,uint256 deadline)");

    constructor(
        address _manufacturer,
        address _securityReviewer,
        address _operator,
        address _emergencyAdmin
    ) EIP712("FirmwareCouncil", "1") {
        _grantRole(DEFAULT_ADMIN_ROLE, _msgSender());
        _grantRole(MANUFACTURER_ROLE, _manufacturer);
        _grantRole(SECURITY_REVIEWER_ROLE, _securityReviewer);
        _grantRole(OPERATOR_ROLE, _operator);
        _grantRole(EMERGENCY_ADMIN_ROLE, _emergencyAdmin);
    }

    // ------------------------------------------------------------ admin

    /// @notice Register a signer/address for a given governance role (signature verifier).
    function registerSigner(address signer, bytes32 role) external onlyRole(DEFAULT_ADMIN_ROLE) {
        require(signer != address(0), "zero signer");
        require(
            role == MANUFACTURER_ROLE || role == SECURITY_REVIEWER_ROLE ||
            role == OPERATOR_ROLE || role == EMERGENCY_ADMIN_ROLE,
            "bad role"
        );
        signerRole[signer] = role;
        _signersOfRole[role].push(signer);
        emit SignerRegistered(signer, role);
    }

    function revokeSigner(address signer) external onlyRole(DEFAULT_ADMIN_ROLE) {
        signerRole[signer] = bytes32(0);
        emit SignerRevoked(signer);
    }

    // ------------------------------------------------------------ product lines

    function registerProductLine(
        bytes32 id,
        bytes32 metadataHash
    ) external onlyRole(MANUFACTURER_ROLE) whenNotPaused returns (bytes32) {
        require(!productLines[id].active, "exists");
        productLines[id] = ProductLine({id: id, manufacturer: _msgSender(), metadataHash: metadataHash, active: true});
        _productLineIds.push(id);
        emit ProductLineRegistered(id, _msgSender(), metadataHash);
        return id;
    }

    // ------------------------------------------------------------ releases

    function proposeRelease(
        bytes32 productLineId,
        bytes32 versionHash,
        bytes32 manifestDigest
    ) external onlyRole(MANUFACTURER_ROLE) whenNotPaused returns (bytes32 releaseId) {
        ProductLine memory pl = productLines[productLineId];
        if (!pl.active) revert ProductLineInactive();
        if (pl.manufacturer != _msgSender()) revert NotProductLineOwner();

        bytes32 releaseKey = keccak256(abi.encodePacked(productLineId, versionHash));
        if (_successorOfKey[releaseKey] != bytes32(0)) revert ReleaseVersionCollision();

        releaseId = keccak256(
            abi.encodePacked(productLineId, versionHash, block.chainid, block.timestamp, ++_nonce)
        );
        releases[releaseId] = Release({
            releaseId: releaseId,
            productLineId: productLineId,
            versionHash: versionHash,
            manifestDigest: manifestDigest,
            manufacturer: _msgSender(),
            createdAt: uint64(block.timestamp),
            status: ReleaseStatus.Proposed
        });
        _releaseIds.push(releaseId);
        _successorOfKey[releaseKey] = releaseId;
        emit ReleaseProposed(releaseId, productLineId, versionHash, manifestDigest, _msgSender());
    }

    /**
     * @notice Approve/reject/request-changes with a bound EIP-712 signature.
     *         Security reviewers act in Proposed; operators act in SecurityApproved.
     */
    function approveRelease(
        bytes32 releaseId,
        Decision decision,
        uint256 nonce,
        uint256 deadline,
        bytes calldata signature
    ) external whenNotPaused returns (bytes32 sigDigest) {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        require(block.timestamp <= deadline, "expired");

        address signer = MessageHashUtils.toTypedDataHash(
            _domainSeparatorV4(),
            keccak256(abi.encode(_APPROVAL_TYPEHASH, releaseId, decision, nonce, deadline))
        ).recover(signature);
        if (signer == address(0)) revert BadSignature(releaseId, signature);
        if (consumedNonces[releaseId][signer] >= nonce) revert BadSignature(releaseId, signature);
        consumedNonces[releaseId][signer] = nonce;

        bytes32 signerRoleHash = signerRole[signer];
        if (signerRoleHash == bytes32(0)) revert BadSignature(releaseId, signature);

        if (
            signerRoleHash == SECURITY_REVIEWER_ROLE &&
            rel.status == ReleaseStatus.Proposed
        ) {
            rel.status = ReleaseStatus.SecurityApproved;
        } else if (
            signerRoleHash == OPERATOR_ROLE &&
            rel.status == ReleaseStatus.SecurityApproved &&
            decision == Decision.Approve
        ) {
            rel.status = ReleaseStatus.OperatorApproved;
        } else if (
            (signerRoleHash == SECURITY_REVIEWER_ROLE || signerRoleHash == OPERATOR_ROLE) &&
            decision != Decision.Approve
        ) {
            rel.status = ReleaseStatus.Rejected;
        } else {
            revert WrongPhase(releaseId, uint8(rel.status));
        }

        if (hasDecision[releaseId][signer]) revert DuplicateDecision(releaseId, signer);
        hasDecision[releaseId][signer] = true;

        sigDigest = keccak256(signature);
        Approval memory a = Approval({
            releaseId: releaseId,
            approver: signer,
            role: signerRoleHash,
            decision: decision,
            timestamp: uint64(block.timestamp),
            signatureDigest: sigDigest
        });
        approvalsOf[releaseId].push(a);

        if (decision == Decision.Approve) {
            emit ReleaseApproved(releaseId, signer, signerRoleHash, sigDigest);
        } else {
            emit ReleaseRejected(releaseId, signer, decision, sigDigest);
        }
    }

    // ------------------------------------------------------------ canary & rollout

    function openCanary(
        bytes32 releaseId,
        bytes32 rolloutPolicyHash
    ) external onlyRole(OPERATOR_ROLE) whenNotPaused returns (bytes32 rolloutId) {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        if (rel.status != ReleaseStatus.OperatorApproved) revert WrongPhase(releaseId, uint8(rel.status));

        rel.status = ReleaseStatus.CanaryOpen;
        _rolloutCounter[releaseId]++;
        rolloutId = keccak256(abi.encodePacked(releaseId, _rolloutCounter[releaseId], block.chainid));
        rollouts[rolloutId] = Rollout({
            releaseId: releaseId,
            rolloutPolicyHash: rolloutPolicyHash,
            currentStage: 0,
            paused: false,
            finalised: false
        });
        _rolloutOfRelease[releaseId] = rollouts[rolloutId];
        emit RolloutStarted(releaseId, rolloutPolicyHash, 0);
        emit CanaryOpened(releaseId, _msgSender());
    }

    function recordCanaryResult(bytes32 releaseId, bool success)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
    {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        if (rel.status != ReleaseStatus.CanaryOpen) revert WrongPhase(releaseId, uint8(rel.status));
        // Canary failure halts progression: release enters Paused pending incident.
        // (Backend mirrors this as CANARY_FAILED / PAUSED and opens an incident.)
        rel.status = success ? ReleaseStatus.CanaryPassed : ReleaseStatus.Paused;
        if (!success) {
            Rollout storage r = _rolloutOfRelease[releaseId];
            r.paused = true;
        }
        emit CanaryResultRecorded(releaseId, success);
    }

    /// @notice Authorise the (staged) rollout once the canary has passed.
    function authoriseRollout(bytes32 releaseId)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
        returns (bool)
    {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        if (rel.status != ReleaseStatus.CanaryPassed) revert WrongPhase(releaseId, uint8(rel.status));
        bool ok = true;
        ok = ok && this.hasSecurityApproval(releaseId);
        require(ok, "missing security approval");
        rel.status = ReleaseStatus.RolloutRunning;
        Rollout storage r = _rolloutOfRelease[releaseId];
        require(r.releaseId == releaseId, "no rollout");
        emit RolloutAuthorised(releaseId);
        emit RolloutAdvanced(releaseId, 1);
        return true;
    }

    function advanceRollout(bytes32 releaseId, uint8 stage) external onlyRole(OPERATOR_ROLE) whenNotPaused {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        if (rel.status != ReleaseStatus.RolloutRunning) revert WrongPhase(releaseId, uint8(rel.status));
        Rollout storage r = _rolloutOfRelease[releaseId];
        if (stage <= r.currentStage) revert NotAuthorisedForStage(r.currentStage, stage);
        r.currentStage = stage;
        emit RolloutAdvanced(releaseId, stage);
    }

    function pauseRollout(bytes32 releaseId) external {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        bool isOperator = hasRole(OPERATOR_ROLE, _msgSender());
        bool isEmergency = hasRole(EMERGENCY_ADMIN_ROLE, _msgSender());
        require(isOperator || isEmergency, "no authority");

        if (isEmergency) { /* emergency admins may pause per-release without global lockout */ }
        Rollout storage r = _rolloutOfRelease[releaseId];
        require(r.paused != true, "already paused");
        r.paused = true;
        rel.status = ReleaseStatus.Paused;
        emit ReleasePaused(releaseId, _msgSender());
    }

    /// @notice Resume after incident: Pulls paused -> RolloutRunning (operator only).
    function resumeRollout(bytes32 releaseId) external onlyRole(OPERATOR_ROLE) {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0) || rel.status != ReleaseStatus.Paused) revert ReleaseNotFound(releaseId);
        Rollout storage r = _rolloutOfRelease[releaseId];
        r.paused = false;
        rel.status = ReleaseStatus.RolloutRunning;
        _unpause();
        emit ReleaseResumed(releaseId, _msgSender());
    }

    /// @notice Finalise the rollout to DEPLOYED once all stages are complete.
    function finaliseDeploy(bytes32 releaseId, uint8 maxStage)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
    {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0) || rel.status != ReleaseStatus.RolloutRunning) revert ReleaseNotFound(releaseId);
        Rollout storage r = _rolloutOfRelease[releaseId];
        require(r.currentStage >= maxStage, "stages incomplete");
        rel.status = ReleaseStatus.Deployed;
        r.finalised = true;
        emit RolloutAdvanced(releaseId, maxStage);
    }

    function revokeRelease(bytes32 releaseId) external {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        bool isOperator = hasRole(OPERATOR_ROLE, _msgSender());
        bool isEmergency = hasRole(EMERGENCY_ADMIN_ROLE, _msgSender());
        require(isOperator || isEmergency, "no authority");
        require(rel.status != ReleaseStatus.Revoked && rel.status != ReleaseStatus.Superseded, "terminal");
        rel.status = ReleaseStatus.Revoked;
        _rolloutOfRelease[releaseId].paused = true;
        emit ReleaseRevoked(releaseId, _msgSender());
    }

    /// @notice Explicit supersession by a successor release (forward pin).
    function supersedeRelease(bytes32 releaseId, bytes32 successorId)
        external
        onlyRole(OPERATOR_ROLE)
        whenNotPaused
    {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        if (rel.status == ReleaseStatus.Superseded) revert AlreadySuperseded();
        Release storage succ = releases[successorId];
        if (succ.releaseId == bytes32(0)) revert ReleaseNotFound(successorId);
        require(succ.productLineId == rel.productLineId, "different product line");
        require(succ.manufacturer == rel.manufacturer, "different manufacturer");

        rel.status = ReleaseStatus.Superseded;
        _successorOf[releaseId] = successorId;
        emit ReleaseSuperseded(releaseId, successorId);
    }

    // ------------------------------------------------------------ receipts

    function recordBatchReceipt(
        bytes32 releaseId,
        bytes32 receiptRoot,
        uint32 count
    ) external onlyRole(OPERATOR_ROLE) nonReentrant {
        Release storage rel = releases[releaseId];
        if (rel.releaseId == bytes32(0)) revert ReleaseNotFound(releaseId);
        if (count == 0) revert ReceiptsNotFinalised();
        ReleaseStatus s = rel.status;
        if (
            s != ReleaseStatus.RolloutRunning &&
            s != ReleaseStatus.CanaryOpen && s != ReleaseStatus.CanaryPassed &&
            s != ReleaseStatus.Deployed
        ) revert ReleaseNotAuthorised(releaseId);

        batchReceipts[releaseId] = Receipt({
            releaseId: releaseId,
            receiptRoot: receiptRoot,
            count: count,
            updatedAt: uint64(block.timestamp),
            onChain: true
        });
        emit BatchReceiptCommitted(releaseId, receiptRoot, count);
    }

    // ------------------------------------------------------------ views

    function hasSecurityApproval(bytes32 releaseId) public view returns (bool) {
        Approval[] storage list = approvalsOf[releaseId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i].role == SECURITY_REVIEWER_ROLE && list[i].decision == Decision.Approve) return true;
        }
        return false;
    }

    function hasOperatorApproval(bytes32 releaseId) public view returns (bool) {
        Approval[] storage list = approvalsOf[releaseId];
        for (uint256 i = 0; i < list.length; i++) {
            if (list[i].role == OPERATOR_ROLE && list[i].decision == Decision.Approve) return true;
        }
        return false;
    }

    function releaseCount() external view returns (uint256) { return _releaseIds.length; }

    function productLineCount() external view returns (uint256) { return _productLineIds.length; }

    function successorOf(bytes32 releaseId) external view returns (bytes32) { return _successorOf[releaseId]; }

    function approvalsOfRelease(bytes32 releaseId) external view returns (Approval[] memory) {
        return approvalsOf[releaseId];
    }

    function rolloutOfRelease(bytes32 releaseId) external view returns (Rollout memory) {
        return _rolloutOfRelease[releaseId];
    }
}

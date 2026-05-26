// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/**
 * @title ViolationRegistry
 * @notice Ghi nhận vi phạm thi cử lên blockchain để đảm bảo tính minh bạch.
 *         Chỉ emit event (không lưu storage) → tiết kiệm gas.
 *         dataHash = SHA-256 payload → dùng để verify integrity sau này.
 */
contract ViolationRegistry {
    struct Violation {
        string violationType;
        uint256 timestamp;
    }

    event ViolationLogged(
        string indexed sessionId,
        bytes32 dataHash,
        Violation[] violations,
        uint256 timestamp
    );

    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor() {
        owner = msg.sender;
    }

    /**
     * @notice Ghi vi phạm lên chain. Chỉ owner (backend wallet) mới được gọi.
     * @param sessionId  UUID của phiên giám sát
     * @param dataHash   SHA-256 hash của payload gốc (dùng để verify)
     * @param violations Mảng vi phạm (type + timestamp)
     */
    function logViolation(
        string calldata sessionId,
        bytes32 dataHash,
        Violation[] calldata violations
    ) external onlyOwner {
        emit ViolationLogged(sessionId, dataHash, violations, block.timestamp);
    }
}

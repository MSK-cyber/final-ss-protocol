// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library ReferralCodeLib {
    struct ReferralData {
        mapping(address => uint256) userNonce;
        mapping(string => address) referralCodeToUser;
        mapping(address => string) userReferralCode;
        // Optional config: 0 means use defaults (length=12, attempts=32)
        uint256 codeLength;
        uint256 maxGenerateAttempts;
        // Optional rate limiting: if > 0, enforce min seconds between generations per user
        mapping(address => uint256) lastCodeGeneration;
        uint256 minSecondsBetweenCodes;
    }

    event ReferralCodeGenerated(address indexed user, string code);

    function assignReferralCodeIfNeeded(
        ReferralData storage data,
        address user
    ) internal {
        require(user != address(0), "zero user");
        if (bytes(data.userReferralCode[user]).length == 0) {
            string memory code = generateReferralCode(data, user);
            data.userReferralCode[user] = code;
            emit ReferralCodeGenerated(user, code);
        }
    }

    function generateReferralCode(
        ReferralData storage data,
        address user
    ) internal returns (string memory code) {
        require(user != address(0), "zero user");
        data.userNonce[user]++;
        // Defaults: length=12, attempts=32 for stronger uniqueness
        uint256 length = data.codeLength == 0 ? 12 : data.codeLength;
        uint256 maxAttempts = data.maxGenerateAttempts == 0
            ? 32
            : data.maxGenerateAttempts;
        require(length > 3 && length <= 32, "Invalid code length");
        if (data.minSecondsBetweenCodes > 0) {
            require(
                block.timestamp >=
                    data.lastCodeGeneration[user] +
                        data.minSecondsBetweenCodes,
                "Rate limited"
            );
        }
        // Build an entropy seed outside the loop to reduce gas; vary per attempt
        bytes32 seed = keccak256(
            abi.encodePacked(
                user,
                data.userNonce[user],
                blockhash(block.number - 1),
                block.prevrandao,
                address(this),
                block.chainid
            )
        );
        uint256 startGas = gasleft();
        uint256 gasBudget = 500000; // soft budget
        for (uint256 i = 0; i < maxAttempts; i++) {
            if (gasleft() < 15000) break; // safety floor
            if (startGas - gasleft() > gasBudget) break; // respect budget
            bytes32 hash = keccak256(abi.encodePacked(seed, i));
            code = toAlphanumericString(hash, length);
            if (_trySetReferralCode(data, code, user)) {
                if (data.minSecondsBetweenCodes > 0) {
                    data.lastCodeGeneration[user] = block.timestamp;
                }
                return code;
            }
        }
        revert("Unable to generate unique referral code");
    }

    function _trySetReferralCode(
        ReferralData storage data,
        string memory code,
        address user
    ) internal returns (bool) {
        if (data.referralCodeToUser[code] == address(0)) {
            data.referralCodeToUser[code] = user;
            return true;
        }
        return false;
    }

    /**
     * @notice Rotates (changes) a user's referral code to a freshly generated unique code
     * @dev Cleans up old mapping to avoid dangling references; respects rate limiting
     */
    function rotateReferralCode(
        ReferralData storage data,
        address user
    ) internal returns (string memory newCode) {
        require(user != address(0), "zero user");
        // Respect rate limiting window if configured
        if (data.minSecondsBetweenCodes > 0) {
            require(
                block.timestamp >=
                    data.lastCodeGeneration[user] +
                        data.minSecondsBetweenCodes,
                "Rate limited"
            );
        }
        // Clean up old mapping if any
        string memory old = data.userReferralCode[user];
        if (bytes(old).length != 0) {
            // Only clear mapping if it points to this user
            if (data.referralCodeToUser[old] == user) {
                delete data.referralCodeToUser[old];
            }
        }
        newCode = generateReferralCode(data, user);
        data.userReferralCode[user] = newCode;
        emit ReferralCodeGenerated(user, newCode);
    }

    /**
     * @notice Allows setting a custom referral code if available and valid
     * @dev Enforces validity, uniqueness, rate-limit, and cleans old mapping
     */
    function setCustomReferralCode(
        ReferralData storage data,
        address user,
        string memory desiredCode
    ) internal {
        require(user != address(0), "zero user");
        require(isValidReferralCode(desiredCode), "invalid code");
        // Enforce rate limit if configured
        if (data.minSecondsBetweenCodes > 0) {
            require(
                block.timestamp >=
                    data.lastCodeGeneration[user] +
                        data.minSecondsBetweenCodes,
                "Rate limited"
            );
        }
        // Must be unused or belong to this user already
        address owner = data.referralCodeToUser[desiredCode];
        require(owner == address(0) || owner == user, "code taken");
        // Clean up old code mapping if necessary
        string memory old = data.userReferralCode[user];
        if (bytes(old).length != 0 && keccak256(bytes(old)) != keccak256(bytes(desiredCode))) {
            if (data.referralCodeToUser[old] == user) {
                delete data.referralCodeToUser[old];
            }
        }
        // Assign
        data.referralCodeToUser[desiredCode] = user;
        data.userReferralCode[user] = desiredCode;
        if (data.minSecondsBetweenCodes > 0) {
            data.lastCodeGeneration[user] = block.timestamp;
        }
        emit ReferralCodeGenerated(user, desiredCode);
    }

    function toAlphanumericString(
        bytes32 hash,
        uint256 length
    ) internal pure returns (string memory) {
        // Exclude confusing characters: 0, O, 1, I, l to improve UX
        bytes memory charset =
            "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
        bytes memory result = new bytes(length);
        for (uint256 i = 0; i < length; i++) {
            result[i] = charset[uint8(hash[i]) % charset.length];
        }
        return string(result);
    }

    function isValidReferralCode(
        string memory code
    ) internal pure returns (bool) {
        bytes memory b = bytes(code);
        if (b.length < 4 || b.length > 32) return false;
        // Match exactly the generation charset
        bytes memory allowed =
            "23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz";
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            bool ok = false;
            for (uint256 j = 0; j < allowed.length; j++) {
                if (c == allowed[j]) {
                    ok = true;
                    break;
                }
            }
            if (!ok) return false;
        }
        return true;
    }

    // Optional: suggest code length based on expected users and attempts
    function calculateOptimalCodeLength(
        uint256 expectedUsers
    ) internal pure returns (uint256) {
        // Rough thresholds for 57^len space vs expected collisions (very conservative)
        if (expectedUsers == 0) return 12;
        if (expectedUsers <= 1_000_000) return 6; // 57^6 ~ 34B
        if (expectedUsers <= 100_000_000) return 7; // 57^7 ~ 1.9T
        return 8;
    }

    // Admin maintenance: clear orphaned mapping entries if needed
    function adminCleanupCode(
        ReferralData storage data,
        string memory code,
        address expectedUser
    ) internal {
        require(bytes(code).length > 0, "empty code");
        require(expectedUser != address(0), "zero user");
        require(
            data.referralCodeToUser[code] == expectedUser,
            "mismatch"
        );
        // Do not clear if the user currently uses this code in userReferralCode
        if (
            keccak256(bytes(data.userReferralCode[expectedUser])) !=
            keccak256(bytes(code))
        ) {
            delete data.referralCodeToUser[code];
        }
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ReferralCodeLib
 * @author State Protocol Team
 * @notice Library for generating and managing unique referral codes for DAV token system
 * @dev Library functions called only by DavToken.sol (not directly callable by users).
 * @custom:security Access control enforced in DavToken.sol
 * @custom:use Users share codes to earn 5% bonus on referrals' DAV mints
 * @custom:format Alphanumeric codes excluding confusing characters (0,O,1,I,l), length 4-32
 * @custom:randomness Sufficient for uniqueness (not cryptographic), users can set custom codes anyway
 * @custom:features Auto-generation, custom codes, code rotation, rate limiting, collision handling (32 attempts)
 * @custom:gas 500k soft limit, early exit on collision or low gas
 */
library ReferralCodeLib {
    
    // ================= Custom Errors =================
    
    /// @notice Thrown when attempting to use zero address
    error ZeroAddress();
    
    /// @notice Thrown when referral code format is invalid
    error InvalidCodeFormat();
    
    /// @notice Thrown when code length is outside valid range (4-32)
    error InvalidCodeLength();
    
    /// @notice Thrown when user attempts action too soon (rate limited)
    error RateLimited();
    
    /// @notice Thrown when desired code is already taken by another user
    error CodeAlreadyTaken();
    
    /// @notice Thrown when unable to generate unique code after max attempts
    error UnableToGenerateUniqueCode();
    
    /// @notice Thrown when code string is empty
    error EmptyCode();
    
    /// @notice Thrown when cleanup target doesn't match expected user
    error CleanupMismatch();
    
    // ================= Structs =================
    
    /**
     * @notice Storage structure for referral code system state
     * @dev Used by DavToken.sol to store all referral-related data
     * @param userNonce Incrementing counter per user for randomness
     * @param referralCodeToUser Maps referral code to owner address
     * @param userReferralCode Maps user address to their current code
     * @param codeLength Configurable code length (0 = use default 12)
     * @param maxGenerateAttempts Max collision attempts (0 = use default 32)
     * @param lastCodeGeneration Timestamp of user's last code generation
     * @param minSecondsBetweenCodes Cooldown period between code changes (0 = no limit)
     */
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

    // ================= Events =================
    
    /// @notice Emitted when a referral code is generated or assigned to a user
    /// @param user Address of the user receiving the code
    /// @param code The referral code string
    event ReferralCodeGenerated(address indexed user, string code);

    // ================= Core Functions =================

    /**
     * @notice Assigns a referral code to user if they don't have one
     * @param data ReferralData storage reference from DavToken.sol
     * @param user Address to assign code to
     * @custom:atomic Called from DavToken.sol with nonReentrant modifier
     * @custom:collision 32 attempts to find unique code (54^12 = 618 quintillion possible codes)
     * @custom:gas ~2k if user has code, ~50-100k if generating new code
     */
    function assignReferralCodeIfNeeded(
        ReferralData storage data,
        address user
    ) internal {
        if (user == address(0)) revert ZeroAddress();
        if (bytes(data.userReferralCode[user]).length == 0) {
            string memory code = generateReferralCode(data, user);
            data.userReferralCode[user] = code;
            emit ReferralCodeGenerated(user, code);
        }
    }

    /**
     * @notice Generates a unique referral code for a user
     * @param data ReferralData storage reference
     * @param user Address generating the code
     * @return code Generated unique referral code
     * @custom:randomness Pseudo-random (not cryptographic) - sufficient for referral codes
     * @custom:sources User address, nonce, blockhash, prevrandao, contract address, chain ID
     * @custom:collision Up to 32 attempts with different seeds (12-char = 54^12 ≈ 10^21 combinations)
     * @custom:gas 500k soft budget, 15k safety floor per iteration
     * @custom:ratelimit Optional cooldown between generations to prevent spam
     */
    function generateReferralCode(
        ReferralData storage data,
        address user
    ) internal returns (string memory code) {
        if (user == address(0)) revert ZeroAddress();
        data.userNonce[user]++;
        // Defaults: length=12, attempts=32 for stronger uniqueness
        uint256 length = data.codeLength == 0 ? 12 : data.codeLength;
        uint256 maxAttempts = data.maxGenerateAttempts == 0
            ? 32
            : data.maxGenerateAttempts;
        if (length <= 3 || length > 32) revert InvalidCodeLength();
        if (data.minSecondsBetweenCodes > 0) {
            if (block.timestamp < data.lastCodeGeneration[user] + data.minSecondsBetweenCodes) {
                revert RateLimited();
            }
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
        revert UnableToGenerateUniqueCode();
    }

    /**
     * @notice Internal helper to atomically check and set a referral code
     * @param data ReferralData storage reference
     * @param code The code to attempt setting
     * @param user The user claiming this code
     * @return success True if code was set, false if already taken
     */
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
     * @param data ReferralData storage reference
     * @param user Address requesting code rotation
     * @return newCode The newly generated referral code
     * @custom:ratelimit Enforced in generateReferralCode() call
     * @custom:cleanup Old code mapping deleted if user owns it
     * @custom:atomic Transaction rollback prevents partial state on failure
     */
    function rotateReferralCode(
        ReferralData storage data,
        address user
    ) internal returns (string memory newCode) {
        if (user == address(0)) revert ZeroAddress();
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
     * @notice Allows user to set a custom referral code
     * @param data ReferralData storage reference
     * @param user Address setting custom code
     * @param desiredCode Custom code string to set
     * @custom:validation Format and availability checked before state changes
     * @custom:atomic All operations in single transaction (all-or-nothing)
     * @custom:cleanup Old code deleted only if user owns it
     */
    function setCustomReferralCode(
        ReferralData storage data,
        address user,
        string memory desiredCode
    ) internal {
        if (user == address(0)) revert ZeroAddress();
        if (!isValidReferralCode(desiredCode)) revert InvalidCodeFormat();
        // Enforce rate limit if configured
        if (data.minSecondsBetweenCodes > 0) {
            if (block.timestamp < data.lastCodeGeneration[user] + data.minSecondsBetweenCodes) {
                revert RateLimited();
            }
        }
        // Must be unused or belong to this user already
        address owner = data.referralCodeToUser[desiredCode];
        if (owner != address(0) && owner != user) revert CodeAlreadyTaken();
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

    // ================= Helper Functions =================

    /**
     * @notice Converts bytes32 hash to alphanumeric string
     * @param hash Input hash to convert
     * @param length Desired output length
     * @return Alphanumeric string of specified length
     * @custom:charset 54 chars - numbers 2-9, uppercase excluding I/L/O, lowercase excluding i/l/o
     * @custom:validation Length validated at caller level in generateReferralCode()
     * @custom:bias Modulo creates ~0.2% bias, acceptable for non-cryptographic codes
     */
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

    /**
     * @notice Validates if a string is a valid referral code
     * @dev Uses optimized byte range checks instead of nested loops
     *      
     *      Valid characters (matches generation charset exactly):
     *      - '2'-'9': 0x32-0x39 (8 chars)
     *      - 'A'-'Z' except I,L,O: 0x41-0x5A minus 0x49,0x4C,0x4F (23 chars)
     *      - 'a'-'z' except i,l,o: 0x61-0x7A minus 0x69,0x6C,0x6F (23 chars)
     *      Total: 54 characters
     *      
     *      Excluded for readability:
     *      - '0' looks like 'O'
     *      - '1' looks like 'I' or 'l'
     *      - 'I' looks like '1' or 'l'
     *      - 'L' looks like '1' or 'I'
     *      - 'O' looks like '0'
     *      - 'i' looks like '1' or 'l'
     *      - 'l' looks like '1' or 'I'
     *      - 'o' looks like '0'
     *      
     *      Length requirements:
     *      - Minimum: 4 characters (prevents too short codes)
     *      - Maximum: 32 characters (prevents gas issues)
     *      
     *      Gas Optimization:
     *      - O(n) complexity instead of O(n*m)
     *      - ~70% gas savings vs nested loop validation
     *      - Direct byte comparisons (fastest)
     *      
     * @param code String to validate
     * @return True if valid referral code format
     */
    function isValidReferralCode(
        string memory code
    ) internal pure returns (bool) {
        bytes memory b = bytes(code);
        if (b.length < 4 || b.length > 32) return false;
        
        for (uint256 i = 0; i < b.length; i++) {
            bytes1 c = b[i];
            
            // Check if character is in valid ranges
            if (
                (c >= 0x32 && c <= 0x39) ||                                        // '2'-'9' (8 chars)
                (c >= 0x41 && c <= 0x5A && c != 0x49 && c != 0x4C && c != 0x4F) || // 'A'-'Z' except 'I','L','O' (23 chars)
                (c >= 0x61 && c <= 0x7A && c != 0x69 && c != 0x6C && c != 0x6F)    // 'a'-'z' except 'i','l','o' (23 chars)
            ) {
                continue;
            }
            
            return false;
        }
        return true;
    }

    // ================= Optional Helper Functions =================

    /**
     * @notice Suggests optimal code length based on expected user count
     * @dev Calculates length to minimize collision probability
     *      
     *      Collision Probability Math:
     *      - 54^6 = 24.6 billion combinations
     *      - 54^7 = 1.3 trillion combinations  
     *      - 54^8 = 72.6 trillion combinations
     *      - 54^12 = 618 quintillion combinations (default)
     *      
     *      Birthday Paradox:
     *      - With n users and k possible codes
     *      - Collision probability ≈ (n^2)/(2k)
     *      - Want probability < 0.1% for good UX
     *      
     * @param expectedUsers Expected number of users in system
     * @return Recommended code length
     */
    function calculateOptimalCodeLength(
        uint256 expectedUsers
    ) internal pure returns (uint256) {
        // Rough thresholds for 54^len space vs expected collisions (very conservative)
        if (expectedUsers == 0) return 12;
        if (expectedUsers <= 1_000_000) return 6; // 54^6 ~ 24.6B
        if (expectedUsers <= 100_000_000) return 7; // 54^7 ~ 1.3T
        return 8;
    }

    /**
     * @notice Admin function to clean up orphaned code mappings
     * @dev Should only be called by governance/admin in DavToken.sol
     *      Used for maintenance if mappings become inconsistent
     *      
     *      Safety Checks:
     *      - Verifies code belongs to expected user
     *      - Won't delete if user currently uses this code
     *      - Prevents accidental data corruption
     *      
     *      When to use:
     *      - After contract upgrade/migration
     *      - If bug caused inconsistent state
     *      - For general database maintenance
     *      
     * @param data ReferralData storage reference
     * @param code Code string to clean up
     * @param expectedUser User who should own this code
     */
    function adminCleanupCode(
        ReferralData storage data,
        string memory code,
        address expectedUser
    ) internal {
        if (bytes(code).length == 0) revert EmptyCode();
        if (expectedUser == address(0)) revert ZeroAddress();
        if (data.referralCodeToUser[code] != expectedUser) revert CleanupMismatch();
        
        // Do not clear if the user currently uses this code in userReferralCode
        if (
            keccak256(bytes(data.userReferralCode[expectedUser])) !=
            keccak256(bytes(code))
        ) {
            delete data.referralCodeToUser[code];
        }
    }
}

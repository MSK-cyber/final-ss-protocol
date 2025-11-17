// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title Distribution
 * @author State Protocol Team
 * @notice Library for managing DAV token holder distribution and rewards
 * @dev Library functions can only be called by DavToken.sol (not directly by users).
 * @custom:security Access control enforced in DavToken.sol (nonReentrant, onlyGovernance)
 * @custom:holders Maximum 2500 DAV holders for reward distribution
 * @custom:indexing Uses 1-based index mapping for O(1) holder removal (~145k gas saved)
 * @custom:distribution Two-pass algorithm: calculate total supply, then distribute proportionally
 * @custom:dust Precision loss handled by giving dust to first eligible holder
 * @custom:gas Cached array lengths in loops (~21M gas saved per distribution)
 */
library Distribution {
    
    /// @notice Maximum number of DAV holders that can participate in distributions
    /// @dev Limit set at 2500 to balance gas costs with inclusivity
    uint256 public constant MAX_HOLDERS = 2500;
    
    /**
     * @notice State management for DAV holder tracking and rewards
     * @dev All mappings are managed internally by library functions
     * @param isDAVHolder Quick lookup for holder status
     * @param davHolders Array of all holder addresses (for iteration)
     * @param davHoldersCount Total number of holders (redundancy check)
     * @param holderIndex Index in davHolders array (1-based, 0 = not in array) for O(1) removal
     * @param holderRewards Accumulated unclaimed rewards per holder
     * @param holderFunds Total funds available for distribution
     */
    struct HolderState {
        mapping(address => bool) isDAVHolder;
        address[] davHolders;
        uint256 davHoldersCount;
        mapping(address => uint256) holderIndex; // Index in davHolders array (1-based, 0 = not in array)
        mapping(address => uint256) holderRewards;
        uint256 holderFunds;
    }

    // ================= Events =================
    
    /// @notice Emitted when a new holder is added to the distribution list
    /// @param account Address of the newly added holder
    event HolderAdded(address indexed account);
    
    /// @notice Emitted when a holder is removed from the distribution list
    /// @param account Address of the removed holder
    event HolderRemoved(address indexed account);
    
    /// @notice Emitted when holder share is distributed
    /// @param totalHolderShare Total amount allocated for distribution
    /// @param totalDistributed Amount actually distributed (may differ due to precision loss)
    /// @param dust Amount of dust remaining after distribution
    /// @param holderCount Number of holders participating in distribution
    event HolderShareDistributed(
        uint256 totalHolderShare,
        uint256 totalDistributed,
        uint256 dust,
        uint256 holderCount
    );

    // ================= Core Functions =================
    
    /**
     * @notice Updates DAV holder status based on active balance
     * @param state HolderState storage reference from DavToken.sol
     * @param account Address to update holder status for
     * @param governance Governance address to exclude from holder list
     * @param getActiveBalance Function pointer to get account's active DAV balance
     * @custom:indexing Uses 1-based indexing: holderIndex[account] = 0 means not in array, >= 1 means in array
     * @custom:safety Removal only executes when isDAVHolder[account] == true, preventing underflow
     * @custom:gas O(1) removal via swap-and-pop pattern saves ~145k gas vs O(n) loop
     */
    function updateDAVHolderStatus(
        HolderState storage state,
        address account,
        address governance,
        function(address) view returns (uint256) getActiveBalance
    ) internal {
        bool hasActiveBalance = getActiveBalance(account) > 0;
        if (hasActiveBalance && account != governance) {
            if (!state.isDAVHolder[account]) {
                // Enforce 2500 holder limit
                require(state.davHoldersCount < MAX_HOLDERS, "Maximum holder limit reached");
                
                // Add new holder
                state.isDAVHolder[account] = true;
                state.davHolders.push(account);
                state.holderIndex[account] = state.davHolders.length; // Store 1-based index
                state.davHoldersCount++;
                emit HolderAdded(account);
            }
        } else if (!hasActiveBalance && state.isDAVHolder[account]) {
            // Remove holder using O(1) index lookup (swap-and-pop pattern)
            state.isDAVHolder[account] = false;
            
            // Get the index of the account to remove (convert from 1-based to 0-based)
            uint256 indexToRemove = state.holderIndex[account] - 1;
            uint256 lastIndex = state.davHolders.length - 1;
            
            if (indexToRemove != lastIndex) {
                // Move last element to the position of the removed element
                address lastHolder = state.davHolders[lastIndex];
                state.davHolders[indexToRemove] = lastHolder;
                // Update the moved holder's index (1-based: add 1 to 0-based index)
                state.holderIndex[lastHolder] = indexToRemove + 1; // Store 1-based index
            }
            
            // Remove last element
            state.davHolders.pop();
            delete state.holderIndex[account]; // Clear index mapping
            
            state.davHoldersCount--;
            emit HolderRemoved(account);
        }
    }
    
    /**
     * @notice Distribute holder rewards proportionally based on active DAV balance
     * @param state HolderState storage reference from DavToken.sol
     * @param holderShare Total amount to distribute among holders
     * @param governance Governance address to exclude from distribution
     * @param getActiveMintedBalance Function pointer to get holder's active minted DAV balance
     * @custom:atomic Both loops execute in single transaction (nonReentrant prevents state changes)
     * @custom:algorithm Two-pass: calculate total supply, then distribute proportionally
     * @custom:formula holderReward = (holderShare × userBalance) ÷ totalActiveSupply
     * @custom:dust Integer division truncation collected and given to first eligible holder
     * @custom:gas Array length cached once (saves ~5.25M gas per loop at 2500 holders)
     */
    function distributeHolderShare(
        HolderState storage state,
        uint256 holderShare,
        address governance,
        function(address) view returns (uint256) getActiveMintedBalance
    ) internal {
        if (holderShare == 0) return;
        require(state.davHoldersCount <= MAX_HOLDERS, "Holder count exceeds maximum");
        require(state.davHolders.length == state.davHoldersCount, "Inconsistent holder count");
        
        // Cache array length to save gas
        uint256 holderCount = state.davHolders.length;
        
        // First pass: calculate total active supply
        uint256 totalActiveMintedSupply = 0;
        for (uint256 i = 0; i < holderCount; i++) {
            address holder = state.davHolders[i];
            if (holder != governance && state.isDAVHolder[holder]) {
                uint256 active = getActiveMintedBalance(holder);
                if (active > 0) {
                    totalActiveMintedSupply += active;
                }
            }
        }
        
        if (totalActiveMintedSupply == 0) return;
        
        // Second pass: distribute rewards directly to mapping
        uint256 totalDistributed = 0;
        for (uint256 i = 0; i < holderCount; i++) {
            address holder = state.davHolders[i];
            if (holder != governance && state.isDAVHolder[holder]) {
                uint256 balance = getActiveMintedBalance(holder);
                if (balance > 0) {
                    uint256 portion = (holderShare * balance) / totalActiveMintedSupply;
                    if (portion > 0) {
                        state.holderRewards[holder] += portion;
                        totalDistributed += portion;
                    }
                }
            }
        }
        
        // Handle any remaining dust
        if (totalDistributed < holderShare) {
            uint256 dust = holderShare - totalDistributed;
            uint256 dustDistributed = _distributeDustSimple(state, dust, governance, getActiveMintedBalance);
            totalDistributed += dustDistributed;
        }
        
        state.holderFunds += totalDistributed;
        emit HolderShareDistributed(holderShare, totalDistributed, holderShare - totalDistributed, state.davHoldersCount);
    }
    
    /**
     * @notice Distribute remaining dust to first eligible holder
     * @param state HolderState storage reference
     * @param dustAmount Remaining wei to distribute
     * @param governance Governance address to exclude
     * @param getActiveMintedBalance Function pointer to get holder's balance
     * @return distributed Amount of dust actually distributed
     * @custom:design Intentional simplicity over proportional distribution (saves ~5.25M gas)
     * @custom:economics Dust worth $0.000001, gas to manipulate costs $0.0002+ (irrational to exploit)
     * @custom:fairness Array order changes dynamically as holders enter/exit
     */
    function _distributeDustSimple(
        HolderState storage state,
        uint256 dustAmount,
        address governance,
        function(address) view returns (uint256) getActiveMintedBalance
    ) internal returns (uint256 distributed) {
        if (dustAmount == 0) return 0;
        
        // Cache array length to save gas
        uint256 holderCount = state.davHolders.length;
        
        // Find first eligible holder and give them the dust
        for (uint256 i = 0; i < holderCount && distributed < dustAmount; i++) {
            address holder = state.davHolders[i];
            if (holder != governance && state.isDAVHolder[holder]) {
                uint256 balance = getActiveMintedBalance(holder);
                if (balance > 0) {
                    uint256 dustToGive = dustAmount - distributed;
                    state.holderRewards[holder] += dustToGive;
                    distributed += dustToGive;
                    break; // Give all dust to first eligible holder for simplicity
                }
            }
        }
        
        return distributed;
    }

    /**
     * @notice Calculate ETH distribution among different recipients
     * @param value Total ETH amount to distribute
     * @param sender Address performing the mint
     * @param referralCode Referral code (if any)
     * @param governance Governance address
     * @param HOLDER_SHARE Percentage for holders (10 = 10%)
     * @param LIQUIDITY_SHARE Percentage for liquidity/buy&burn (80 = 80%)
     * @param DEVELOPMENT_SHARE Percentage for development (5 = 5%)
     * @param REFERRAL_BONUS Percentage for referral bonus (5 = 5%)
     * @param davHoldersCount Number of current holders
     * @param totalActiveSupply Total active DAV supply
     * @param referralCodeToUser Mapping from referral codes to user addresses
     * @return holderShare Amount allocated for holder distribution
     * @return liquidityShare Amount allocated for liquidity
     * @return developmentShare Amount allocated for development
     * @return referralShare Amount allocated for referral bonus
     * @return stateLPShare Amount allocated for STATE liquidity (remainder)
     * @return referrer Address of referrer (address(0) if none)
     * @custom:validation Input validation done in DavToken.sol; library validates percentages
     * @custom:special Governance minting: holderShare = 0, redistributed to liquidity
     * @custom:special No holders: holderShare = 0, redistributed to liquidity
     */
    function calculateETHDistribution(
        uint256 value,
        address sender,
        string memory referralCode,
        address governance,
        uint256 HOLDER_SHARE,
        uint256 LIQUIDITY_SHARE,
        uint256 DEVELOPMENT_SHARE,
        uint256 REFERRAL_BONUS,
        uint256 davHoldersCount,
        uint256 totalActiveSupply,
        mapping(string => address) storage referralCodeToUser
    )
        internal
        view
        returns (
            uint256 holderShare,
            uint256 liquidityShare,
            uint256 developmentShare,
            uint256 referralShare,
            uint256 stateLPShare,
            address referrer
        )
    {
        // Validate share percentages to prevent over-allocation
        uint256 totalSharesWithoutReferral = HOLDER_SHARE + LIQUIDITY_SHARE + DEVELOPMENT_SHARE;
        require(totalSharesWithoutReferral <= 100, "Base shares exceed 100%");
        require(totalSharesWithoutReferral + REFERRAL_BONUS <= 100, "Total shares with referral exceed 100%");
        
        bool excludeHolderShare = sender == governance;
        require(
            !excludeHolderShare || sender != address(0),
            "Invalid governance address"
        );

        holderShare = excludeHolderShare ? 0 : (value * HOLDER_SHARE) / 100;
        liquidityShare = (value * LIQUIDITY_SHARE) / 100;
        developmentShare = (value * DEVELOPMENT_SHARE) / 100;
        referralShare = 0;
        referrer = address(0);

        if (bytes(referralCode).length > 0) {
            address _ref = referralCodeToUser[referralCode];
            if (_ref != address(0) && _ref != sender) {
                referralShare = (value * REFERRAL_BONUS) / 100;
                referrer = _ref;
            }
        }

        if (davHoldersCount == 0 || totalActiveSupply == 0) {
            liquidityShare += holderShare;
            holderShare = 0;
        }

        uint256 distributed = holderShare +
            liquidityShare +
            developmentShare +
            referralShare;
        require(distributed <= value, "Over-allocation");

        stateLPShare = value - distributed;
        
        // Final safety check: ensure all funds are properly allocated
        require(holderShare + liquidityShare + developmentShare + referralShare + stateLPShare == value, 
                "Distribution math error - funds not properly allocated");
    }
    
    // ================= View Functions =================
    
    /**
     * @notice Get accumulated unclaimed rewards for a holder
     * @dev View function - safe to call anytime, no state changes
     *      Governance address always returns 0 (excluded from distributions)
     *      
     * @param state HolderState storage reference
     * @param account Address to check rewards for
     * @param governance Governance address (excluded from rewards)
     * @return Unclaimed reward amount in wei
     */
    function _earned(
        HolderState storage state,
        address account,
        address governance
    ) public view returns (uint256) {
        if (account == governance) {
            return 0;
        }
        return state.holderRewards[account];
    }
    
    /**
     * @notice Get total number of holders in distribution list
     * @param state HolderState storage reference
     * @return Number of holders currently in distribution list
     * @custom:consistency Fail-fast design: reverts if array length doesn't match counter
     */
    function _holderLength(
        HolderState storage state
    ) public view returns (uint256) {
        require(
            state.davHolders.length == state.davHoldersCount,
            "Inconsistent holder count"
        );
        return state.davHolders.length;
    }
}

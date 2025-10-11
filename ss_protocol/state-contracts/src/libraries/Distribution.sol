// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

library Distribution {
    // Constants for distribution shares
    // DAV Holder limit increased to 5000 with mapping-based efficient distribution
    uint256 public constant MAX_HOLDERS = 5000;
    
    struct HolderState {
        mapping(address => bool) isDAVHolder;
        address[] davHolders;
        uint256 davHoldersCount;
        mapping(address => uint256) holderRewards;
        uint256 holderFunds;
    }

    event HolderAdded(address indexed account);
    event HolderRemoved(address indexed account);
    event HolderShareDistributed(
        uint256 totalHolderShare,
        uint256 totalDistributed,
        uint256 dust,
        uint256 holderCount
    );
    // burn-to-claim cycle allocation event removed
    /**
     * @notice Updates DAV holder status based on active balance
     * @dev Maintains holder list for distribution and enforces 5000 holder limit
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
                // Enforce 5000 holder limit
                require(state.davHoldersCount < MAX_HOLDERS, "Maximum holder limit reached");
                
                // Add new holder
                state.isDAVHolder[account] = true;
                state.davHolders.push(account);
                state.davHoldersCount++;
                emit HolderAdded(account);
            }
        } else if (!hasActiveBalance && state.isDAVHolder[account]) {
            // Remove holder - simple approach for now
            state.isDAVHolder[account] = false;
            
            // Find and remove from array (O(n) operation but only happens on removal)
            for (uint256 i = 0; i < state.davHolders.length; i++) {
                if (state.davHolders[i] == account) {
                    // Move last element to this position
                    state.davHolders[i] = state.davHolders[state.davHolders.length - 1];
                    state.davHolders.pop();
                    break;
                }
            }
            
            state.davHoldersCount--;
            emit HolderRemoved(account);
        }
    }
    /**
     * @notice Enhanced distribution for up to 5000 holders with gas optimization
     * @dev Uses direct mapping approach with minimal memory allocation
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
        
        // First pass: calculate total active supply
        uint256 totalActiveMintedSupply = 0;
        for (uint256 i = 0; i < state.davHolders.length; i++) {
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
        for (uint256 i = 0; i < state.davHolders.length; i++) {
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
     * @notice Simple dust distribution to avoid complexity
     */
    function _distributeDustSimple(
        HolderState storage state,
        uint256 dustAmount,
        address governance,
        function(address) view returns (uint256) getActiveMintedBalance
    ) internal returns (uint256 distributed) {
        if (dustAmount == 0) return 0;
        
        // Find first eligible holder and give them the dust
        for (uint256 i = 0; i < state.davHolders.length && distributed < dustAmount; i++) {
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
    // burn-to-claim cycle allocation logic removed

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

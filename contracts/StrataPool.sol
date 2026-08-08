// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";

import {StrataResolver, StrataTypes} from "./StrataResolver.sol";
import {ICleanversePolicy} from "./interfaces/ICleanversePolicy.sol";
import {IAPass} from "./interfaces/IAPass.sol";

/// @title StrataPool
/// @notice A shared-liquidity pool whose compliance boundary sits on the position, not the pool.
///
/// @dev The problem. A liquidity pool socializes ownership: one asset balance, many claimants.
///      If a single LP is unverified or sanctioned, the holdings of the pool are non-compliant
///      in aggregate. The industry answer is to gate the whole pool, which narrows the
///      participant set and fragments otherwise-identical assets into thin per-jurisdiction
///      silos.
///
///      STRATA keeps one asset balance and one price curve, and partitions the claims on it.
///      Deposits mint shares stamped with the credential of the depositor. Withdrawal runs
///      through StrataResolver, which returns Direct, Routed or Blocked instead of reverting.
///
///      Compliance is bound at issuance and never applied retroactively. A deposit records the
///      stratum it qualified for at the moment it was made; later rule changes can block a
///      stratum going forward but never re-characterise settled history. Retroactive
///      taint-marking destroys fungibility, which is why it is not done here.
///
///      Ownable is not decoration. The Cleanverse /validator/register flow verifies an
///      EIP-191 signature against the on-chain owner() of the contract being registered, so
///      the pool must expose a real owner to be registerable as a compliance pool.
contract StrataPool is ERC20, Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ---------------------------------------------------------------------
    // Errors
    // ---------------------------------------------------------------------

    error ZeroAmount();
    error ZeroAddress();
    error UnknownStratum(uint8 stratumId);
    error AssetNotRegisteredWithPolicy(address asset);
    error SharesAreNonTransferable();
    error TooManyLots();
    error DiscountOutOfRange(uint16 discountBps);
    error DepositTooLarge(uint256 assets);
    error TierTooLowForAToken(uint8 tier, uint8 required);
    error InsufficientShares(uint256 held, uint256 requested);

    // ---------------------------------------------------------------------
    // Events
    // ---------------------------------------------------------------------

    /// @dev The frontend is driven entirely off these events. It never polls state.
    event Deposited(bytes32 indexed cviRef, address indexed account, uint8 stratumId, uint128 shares);

    /// @notice Emitted on every withdrawal attempt, including blocked ones.
    /// @dev Beat 2 of the demo is literally this event rendered. A Blocked outcome still
    ///      emits rather than reverting, because "you may redeem nothing, and here is why"
    ///      is information a compliance officer needs, not an error to be swallowed.
    event ExitPlanned(
        bytes32 indexed cviRef,
        address indexed account,
        StrataTypes.Branch branch,
        uint128 burnable,
        uint128 deferred,
        uint8 reason
    );

    /// @notice Emitted when a deposit is made in the Cleanverse A-Token itself.
    /// @dev Distinct from Deposited because the pool custodies a different instrument.
    ///      The claim is denominated in the A-Token and settles back in it.
    event DepositedAToken(bytes32 indexed cviRef, address indexed account, uint128 shares);

    /// @notice Emitted when an address that deposited anonymously is later identified.
    /// @dev The prior claim is attributed to the credential that now identifies the same
    ///      party. Stratum stamps are carried across untouched, so this re-attributes who
    ///      holds a claim without re-characterising what the claim is.
    event CredentialLinked(bytes32 indexed fromRef, bytes32 indexed toRef, address indexed account);

    event StratumBlocked(uint8 indexed stratumId, uint8 reason);
    event StratumUnblocked(uint8 indexed stratumId);
    event BasisChanged(uint8 indexed a, uint8 indexed b, int256 basis);
    event StratumConfigured(uint8 indexed stratumId, uint8 minTier, uint64 lockUntil, uint16 discountBps);

    // ---------------------------------------------------------------------
    // Constants
    // ---------------------------------------------------------------------

    uint8 public constant STRATUM_OPEN = 0;
    uint8 public constant STRATUM_VERIFIED = 1;

    /// @dev Price is quoted in basis points of par. 10_000 bps == par.
    uint16 public constant PAR_BPS = 10_000;

    /// @dev Bounds the per-account lot array so withdraw() cannot be pushed out of gas by a
    ///      depositor who fragments their own position. Deposits into a stratum already held
    ///      merge into the existing lot, so this ceiling is generous in practice.
    uint256 public constant MAX_LOTS_PER_CREDENTIAL = 32;

    // ---------------------------------------------------------------------
    // Immutable wiring
    // ---------------------------------------------------------------------

    /// @notice The pooled asset. Plain USDC on Monad testnet.
    /// @dev Deliberately NOT the A-Token. A Cleanverse A-Token enforces compliance on every
    ///      transfer and refuses both parties without an A-Pass, which was verified on a fork
    ///      of Monad testnet: a party holding no credential cannot receive aUSDC at all.
    ///      Pooling it would therefore exclude the uncredentialled LP before STRATA ever got
    ///      to grade their exit, collapsing this design back into the pool-level gate it
    ///      exists to replace. Pooling plain USDC keeps the asset freely holdable and moves
    ///      the restriction onto the claim, which is the entire thesis.
    IERC20 public immutable asset;

    /// @notice The registered Cleanverse A-Token (aUSDC).
    /// @dev Serves two roles. It is the instrument every policy question is denominated in,
    ///      because Cleanverse rules bind to a registered A-Token and canTransfer reverts
    ///      TokenNotRegistered for anything else. It is ALSO custodied: depositAToken takes
    ///      it directly, so VERIFIED claims funded in aUSDC are backed by real aUSDC held by
    ///      this contract rather than by a plain-token substitute.
    IERC20 public immutable aToken;

    /// @notice The Cleanverse Policy (Validator) contract. The compliance source of truth.
    ICleanversePolicy public immutable policy;

    /// @notice The Cleanverse A-Pass (CVI) registry. The identity source of truth.
    IAPass public immutable apass;

    // ---------------------------------------------------------------------
    // Stratum schema and state
    // ---------------------------------------------------------------------

    StrataTypes.StratumState[] internal _strata;

    /// @notice Discount applied to each stratum, in basis points off par.
    /// @dev Strata price the same underlying but differ in legal transferability, so each
    ///      carries its own discount. The gap between two strata is the compliance basis:
    ///      the first live on-chain price for what a transfer restriction costs.
    mapping(uint8 stratumId => uint16 bps) public discountBps;

    /// @notice Share lots held by each credential.
    mapping(bytes32 cviRef => StrataTypes.Position[] lots) internal _lots;

    /// @notice Shares whose legal path is currently closed, awaiting compliant liquidation.
    mapping(bytes32 cviRef => uint128 shares) public deferredShares;

    // ---------------------------------------------------------------------
    // Construction
    // ---------------------------------------------------------------------

    /// @param asset_ The pooled asset (plain USDC on Monad testnet).
    /// @param aToken_ A registered Cleanverse A-Token (aUSDC) used as the reference
    ///        instrument for every policy query. Not custodied.
    /// @param policy_ The Cleanverse Policy contract.
    /// @param owner_ Initial owner. Must be able to produce the EIP-191 signature that
    ///        Cleanverse /validator/register checks against owner().
    constructor(IERC20 asset_, IERC20 aToken_, ICleanversePolicy policy_, address owner_)
        ERC20("STRATA Pooled USDC", "sxUSDC")
        Ownable(owner_)
    {
        if (address(asset_) == address(0) || address(policy_) == address(0)) revert ZeroAddress();
        if (address(aToken_) == address(0)) revert ZeroAddress();

        // Fail at construction rather than at the first withdrawal. An unregistered reference
        // makes every canTransfer call revert with TokenNotRegistered, which would present as
        // a mysterious runtime failure instead of a deployment mistake.
        if (!policy_.isTokenRegistered(address(aToken_))) {
            revert AssetNotRegisteredWithPolicy(address(aToken_));
        }

        asset = asset_;
        aToken = aToken_;
        policy = policy_;
        apass = IAPass(policy_.apass());

        // Ship scope is two strata, per PRD.md section 5.
        // OPEN accepts anyone; VERIFIED requires a credential and prices closer to par
        // because its holders can legally move the asset in more venues.
        _strata.push(StrataTypes.StratumState({minTier: 0, lockUntil: 0, blocked: false}));
        _strata.push(StrataTypes.StratumState({minTier: 1, lockUntil: 0, blocked: false}));

        discountBps[STRATUM_OPEN] = 250; // 2.50 percent off par
        discountBps[STRATUM_VERIFIED] = 25; // 0.25 percent off par

        emit StratumConfigured(STRATUM_OPEN, 0, 0, 250);
        emit StratumConfigured(STRATUM_VERIFIED, 1, 0, 25);
    }

    // ---------------------------------------------------------------------
    // Identity
    // ---------------------------------------------------------------------

    /// @notice Credential reference for an address, or an address-derived one when it holds
    ///         no A-Pass.
    /// @dev Positions key on this, never on msg.sender. An address is not a legal person and
    ///      a credential is, so a fresh wallet inherits nothing and revocation reaches every
    ///      wallet that shares the credential.
    ///
    ///      Addresses with no A-Pass are not turned away. They get a deterministic
    ///      address-derived reference and land in the OPEN stratum, which is the whole point:
    ///      an unverified LP should get a legal exit, not a hard revert.
    function credentialOf(address account) public view returns (bytes32 cviRef, uint8 tier) {
        if (apass.balanceOf(account) == 0) {
            return (keccak256(abi.encodePacked("strata.open", account)), 0);
        }

        // getTokenId reverts for non-holders; the balance check above guards it, and the
        // try/catch keeps an unexpected registry revert from bricking deposits.
        try apass.getTokenId(account) returns (uint256 tokenId) {
            return (keccak256(abi.encodePacked("strata.cvi", tokenId)), 1);
        } catch {
            return (keccak256(abi.encodePacked("strata.open", account)), 0);
        }
    }

    /// @notice Whether the Cleanverse Policy currently clears `account` to move the asset.
    /// @dev canTransfer reverts rather than returning false when a party holds no A-Pass
    ///      (verified live on Monad testnet). Mapping that revert to `false` is what converts
    ///      a hard failure into a graded outcome, which is the contribution of this project.
    /// @dev The counterparty passed as `from` is the zero address, not this pool. Two reasons,
    ///      both learned from probing the live contract:
    ///
    ///      1. canTransfer validates BOTH parties symmetrically. Passing the pool would make
    ///         the answer depend on whether the pool itself holds an A-Pass, so every redeemer
    ///         would read as non-clearing until the pool were separately credentialled. The
    ///         question being asked here is about the redeemer, not about the venue.
    ///      2. The zero address is exempt on both sides (verified live), which is the correct
    ///         model anyway: a redemption burns shares and releases the underlying, so it is
    ///         a burn-side movement rather than a peer-to-peer transfer.
    function policyClears(address account) public view returns (bool) {
        try policy.canTransfer(address(aToken), address(0), account, 1) returns (bool ok) {
            return ok;
        } catch {
            return false;
        }
    }

    /// @notice Whether the Policy reports `account` frozen for this asset.
    function isFrozen(address account) public view returns (bool) {
        try policy.isFrozen(address(aToken), account) returns (bool f) {
            return f;
        } catch {
            // A registry that cannot answer is treated as a freeze. Failing closed is the
            // correct default when the question is "may this party legally exit".
            return true;
        }
    }

    // ---------------------------------------------------------------------
    // Deposit
    // ---------------------------------------------------------------------

    /// @notice Attribute an anonymous prior position to the credential that now identifies
    ///         the same address.
    /// @dev Without this, an address that deposited before being verified would be stranded:
    ///      its lots sit under the address-derived reference while credentialOf starts
    ///      returning the credential-derived one, leaving the earlier deposit unreachable.
    ///      That is silent fund loss, and it is exactly the kind of bug that only shows up
    ///      once identity changes mid-life, which is the normal case for a real LP.
    ///
    ///      Idempotent, and permissionless for the address itself. Lots keep their stratum
    ///      stamp, so this changes who is known to hold the claim, never what the claim is -
    ///      compliance stays bound at issuance.
    function linkCredential() public returns (bool migrated) {
        bytes32 openRef = keccak256(abi.encodePacked("strata.open", msg.sender));
        (bytes32 currentRef,) = credentialOf(msg.sender);
        if (currentRef == openRef) return false; // still anonymous, nothing to attribute

        StrataTypes.Position[] storage from = _lots[openRef];
        uint256 n = from.length;
        if (n == 0) return false;

        for (uint256 i = 0; i < n; ++i) {
            if (from[i].shares == 0) continue;
            _creditLot(currentRef, from[i].shares, from[i].stratumId, from[i].aTokenBacked);
            from[i].shares = 0;
        }

        uint128 carriedDeferred = deferredShares[openRef];
        if (carriedDeferred > 0) {
            deferredShares[currentRef] += carriedDeferred;
            deferredShares[openRef] = 0;
        }

        emit CredentialLinked(openRef, currentRef, msg.sender);
        return true;
    }

    /// @notice Deposit `assets` and receive shares stamped with the depositor credential.
    /// @return shares Shares minted.
    /// @dev Shares are 1:1 with assets in ship scope. A yield-bearing curve is orthogonal to
    ///      the contribution and would only add surface to audit.
    function deposit(uint256 assets) external nonReentrant returns (uint256 shares) {
        if (assets == 0) revert ZeroAmount();

        // Sweep any anonymous prior position onto the credential before adding to it, so a
        // depositor can never end up holding two disconnected claims on the same pool.
        linkCredential();

        // Lots and exit plans carry shares as uint128, so a larger deposit would truncate on
        // the way into storage and mint fewer shares than the assets actually received.
        // Rejecting is the only safe answer; silently narrowing would lose depositor funds.
        // The ceiling is ~3.4e38, which against a 6-decimal asset is far beyond any real supply.
        if (assets > type(uint128).max) revert DepositTooLarge(assets);
        // casting to 'uint128' is safe because the line above rejects anything above the range
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 shares128 = uint128(assets);

        (bytes32 cviRef, uint8 tier) = credentialOf(msg.sender);
        uint8 stratumId = tier >= _strata[STRATUM_VERIFIED].minTier ? STRATUM_VERIFIED : STRATUM_OPEN;

        shares = assets;
        _creditLot(cviRef, shares128, stratumId, false);
        _mint(msg.sender, shares);

        asset.safeTransferFrom(msg.sender, address(this), assets);

        emit Deposited(cviRef, msg.sender, stratumId, shares128);
    }

    /// @dev Merges into an existing lot with the same stratum AND the same backing, so the
    ///      lot array stays bounded. Backing is part of the key: two lots can sit in one
    ///      stratum and still be denominated in different instruments, and merging them would
    ///      lose the information needed to settle each in the token it was funded with.
    function _creditLot(bytes32 cviRef, uint128 shares, uint8 stratumId, bool aTokenBacked)
        internal
    {
        StrataTypes.Position[] storage lots = _lots[cviRef];
        uint256 n = lots.length;
        for (uint256 i = 0; i < n; ++i) {
            if (lots[i].stratumId == stratumId && lots[i].aTokenBacked == aTokenBacked) {
                lots[i].shares += shares;
                return;
            }
        }
        if (n >= MAX_LOTS_PER_CREDENTIAL) revert TooManyLots();
        lots.push(
            StrataTypes.Position({
                cviRef: cviRef,
                shares: shares,
                stratumId: stratumId,
                aTokenBacked: aTokenBacked
            })
        );
    }

    /// @notice Deposit the Cleanverse A-Token itself and receive shares backed by it.
    /// @return shares Shares minted.
    ///
    /// @dev This is real CVA custody: the pool holds aUSDC, it does not merely reference it.
    ///
    ///      No wrapping gateway is involved, and none is needed. An A-Token already enforces
    ///      compliance on every transfer and refuses either party without an A-Pass, so a
    ///      party holding aUSDC is by construction credentialled. The only thing standing in
    ///      the way was the pool itself: a contract with no credential cannot receive an
    ///      A-Token at all. The deployed pool holds its own A-Pass, which is what makes this
    ///      function callable.
    ///
    ///      The transfer therefore carries its own enforcement. If the depositor loses their
    ///      credential between approving and calling, the A-Token reverts on its own terms -
    ///      the pool does not re-check what the instrument already checks.
    function depositAToken(uint256 amount) external nonReentrant returns (uint256 shares) {
        if (amount == 0) revert ZeroAmount();
        if (amount > type(uint128).max) revert DepositTooLarge(amount);

        linkCredential();
        (bytes32 cviRef, uint8 tier) = credentialOf(msg.sender);

        uint8 required = _strata[STRATUM_VERIFIED].minTier;
        if (tier < required) revert TierTooLowForAToken(tier, required);

        // casting to 'uint128' is safe because the bound above rejects anything larger
        // forge-lint: disable-next-line(unsafe-typecast)
        uint128 shares128 = uint128(amount);
        shares = amount;

        _creditLot(cviRef, shares128, STRATUM_VERIFIED, true);
        _mint(msg.sender, shares);

        aToken.safeTransferFrom(msg.sender, address(this), amount);

        emit DepositedAToken(cviRef, msg.sender, shares128);
    }

    // ---------------------------------------------------------------------
    // Withdraw
    // ---------------------------------------------------------------------

    /// @notice Ask to exit `shares`. Returns whatever portion is legally redeemable now.
    /// @return plan The branch taken, the amount burned, the amount deferred, and the reason.
    ///
    /// @dev This is the invention. A conventional permissioned pool reverts the entire call
    ///      when the redeemer fails a check, which treats "58 percent of this is legally
    ///      yours" as identical to "none of it is". Here the request is graded:
    ///        Direct  - the whole request clears; burn it all
    ///        Routed  - a strict subset clears; burn only that, defer the rest
    ///        Blocked - nothing clears; burn nothing, record why, emit anyway
    ///
    ///      A Blocked outcome deliberately does not revert. Reverting would erase the reason
    ///      code and leave the redeemer with no on-chain record of having asked.
    function withdraw(uint128 shares) external nonReentrant returns (StrataTypes.ExitPlan memory plan) {
        if (shares == 0) revert ZeroAmount();

        // Entitlement is computed from credential-keyed lots, but settlement burns the ERC20
        // balance of the caller. Checking that balance up front keeps the two views from
        // diverging: without it, a party who acquired the credential of another (an A-Pass is
        // an ERC-721 and can move) would resolve against lots they cannot burn, and the call
        // would fail deep inside _burn with an error that explains nothing.
        uint256 held = balanceOf(msg.sender);
        if (held < shares) revert InsufficientShares(held, shares);

        // A party verified after depositing must be able to reach the earlier position on
        // the way out, not only on the way in.
        linkCredential();

        (bytes32 cviRef, uint8 tier) = credentialOf(msg.sender);

        StrataTypes.RedeemerView memory v = StrataTypes.RedeemerView({
            cviRef: cviRef,
            tier: tier,
            frozen: isFrozen(msg.sender),
            policyClears: policyClears(msg.sender),
            timestamp: uint64(block.timestamp)
        });

        plan = StrataResolver.resolve(v, _lots[cviRef], _strata, shares);

        emit ExitPlanned(cviRef, msg.sender, plan.branch, plan.burnable, plan.deferred, plan.reason);

        // Assigned, not accumulated. Incrementing made two attempts against one 42-share
        // position report 84 deferred, and nothing ever decremented it on success. This is
        // the amount outstanding as of the most recent attempt.
        deferredShares[cviRef] = plan.deferred;

        if (plan.burnable == 0) {
            // Nothing to settle. The event above is the receipt.
            return plan;
        }

        // Effects before interactions: lots debited and shares burned before any transfer.
        (uint128 fromAsset, uint128 fromAToken) = _debitLots(cviRef, v, plan.burnable);
        _burn(msg.sender, plan.burnable);

        // Each lot settles in the instrument it was funded with. Paying an A-Token claim in
        // the plain underlying would quietly strip the compliance properties the holder
        // deposited for, and paying the reverse would hand an A-Token to a party who may not
        // legally hold one.
        if (fromAsset > 0) asset.safeTransfer(msg.sender, fromAsset);
        if (fromAToken > 0) aToken.safeTransfer(msg.sender, fromAToken);
    }

    /// @dev Consumes lots in the same order the resolver used to plan them: unlocked before
    ///      locked, skipping anything that does not clear. Keeping the two in step is what
    ///      makes the settled amount match the planned amount exactly.
    function _debitLots(bytes32 cviRef, StrataTypes.RedeemerView memory v, uint128 amount)
        internal
        returns (uint128 fromAsset, uint128 fromAToken)
    {
        StrataTypes.Position[] storage lots = _lots[cviRef];

        for (uint256 pass = 0; pass < 2 && amount > 0; ++pass) {
            bool wantLocked = (pass == 1);

            for (uint256 i = 0; i < lots.length && amount > 0; ++i) {
                StrataTypes.Position storage p = lots[i];
                if (p.shares == 0) continue;
                if (p.stratumId >= _strata.length) continue;

                StrataTypes.StratumState memory s = _strata[p.stratumId];
                bool locked = s.lockUntil > v.timestamp;
                if (locked != wantLocked) continue;
                if (s.blocked) continue;
                if (v.tier < s.minTier) continue;
                if (locked) continue;
                if (!v.policyClears) continue;

                uint128 take = p.shares < amount ? p.shares : amount;
                p.shares -= take;
                amount -= take;

                if (p.aTokenBacked) {
                    fromAToken += take;
                } else {
                    fromAsset += take;
                }
            }
        }
    }

    // ---------------------------------------------------------------------
    // Pricing and the compliance basis
    // ---------------------------------------------------------------------

    /// @notice Price of one share in a stratum, in basis points of par.
    /// @dev A blocked stratum prices at zero: with no legal path to redemption, the claim is
    ///      not worth par by definition.
    function price(uint8 stratumId) public view returns (uint256) {
        if (stratumId >= _strata.length) revert UnknownStratum(stratumId);
        if (_strata[stratumId].blocked) return 0;
        return PAR_BPS - discountBps[stratumId];
    }

    /// @notice The compliance basis: the price gap between two strata, in basis points.
    /// @dev This is the number the project exists to expose. Issuers today cannot measure
    ///      what their transfer restrictions cost, because no venue prices two legally
    ///      distinct claims on one identical asset side by side. Here it is a single read.
    ///
    ///      The discount factors are governance-set in ship scope, which is stated plainly
    ///      rather than dressed up: the contribution is making the spread a first-class
    ///      on-chain value, not discovering its market-clearing level.
    function basis(uint8 a, uint8 b) public view returns (int256) {
        return int256(price(a)) - int256(price(b));
    }

    // ---------------------------------------------------------------------
    // Revocation
    // ---------------------------------------------------------------------

    /// @notice Re-read asset-level Cleanverse state and update whether a stratum is blocked.
    /// @dev Permissionless, because enforcement of an asset-wide pause must not depend on the
    ///      operator choosing to act on it. It reads ONLY policy.isPaused, which is a property
    ///      of the asset rather than of any single holder.
    ///
    ///      An earlier version took an arbitrary `probe` address and blocked the stratum when
    ///      that probe was frozen. That was a griefing vector: anyone could pass a frozen
    ///      address, block the stratum for every holder in it, and drive price() to zero.
    ///      It also conflated two different facts. One holder being frozen says nothing about
    ///      the legal state of a stratum, and it is already handled per-redeemer through
    ///      RedeemerView.frozen, which no caller can influence. Blocking an entire stratum on
    ///      a credential revocation is a compliance decision, so it lives behind the owner.
    function syncStratum(uint8 stratumId) external {
        if (stratumId >= _strata.length) revert UnknownStratum(stratumId);
        _setBlocked(stratumId, policy.isPaused(address(aToken)), StrataTypes.REASON_POLICY);
    }

    /// @notice Block or unblock a stratum as a compliance action.
    /// @dev Owner-only. This is the operator acting on a credential revocation reported by
    ///      Cleanverse. Deliberately not permissionless - see syncStratum.
    function setStratumBlocked(uint8 stratumId, bool blocked, uint8 reason) external onlyOwner {
        if (stratumId >= _strata.length) revert UnknownStratum(stratumId);
        _setBlocked(stratumId, blocked, reason);
    }

    function _setBlocked(uint8 stratumId, bool blocked, uint8 reason) internal {
        if (blocked == _strata[stratumId].blocked) return;
        _strata[stratumId].blocked = blocked;

        if (blocked) {
            emit StratumBlocked(stratumId, reason);
        } else {
            emit StratumUnblocked(stratumId);
        }
        emit BasisChanged(STRATUM_VERIFIED, STRATUM_OPEN, basis(STRATUM_VERIFIED, STRATUM_OPEN));
    }

    // ---------------------------------------------------------------------
    // Governance
    // ---------------------------------------------------------------------

    /// @notice Configure a stratum. Forward-looking only.
    /// @dev Changing a stratum never re-characterises shares already minted into it, which is
    ///      the on-chain expression of "compliance is bound at issuance, never retroactive".
    function configureStratum(uint8 stratumId, uint8 minTier, uint64 lockUntil, uint16 discount)
        external
        onlyOwner
    {
        if (stratumId >= _strata.length) revert UnknownStratum(stratumId);
        if (discount > PAR_BPS) revert DiscountOutOfRange(discount);

        _strata[stratumId].minTier = minTier;
        _strata[stratumId].lockUntil = lockUntil;
        discountBps[stratumId] = discount;

        emit StratumConfigured(stratumId, minTier, lockUntil, discount);
        emit BasisChanged(STRATUM_VERIFIED, STRATUM_OPEN, basis(STRATUM_VERIFIED, STRATUM_OPEN));
    }

    // ---------------------------------------------------------------------
    // Views for the frontend and for audit
    // ---------------------------------------------------------------------

    function stratumCount() external view returns (uint256) {
        return _strata.length;
    }

    function stratum(uint8 stratumId) external view returns (StrataTypes.StratumState memory) {
        if (stratumId >= _strata.length) revert UnknownStratum(stratumId);
        return _strata[stratumId];
    }

    function lotsOf(bytes32 cviRef) external view returns (StrataTypes.Position[] memory) {
        return _lots[cviRef];
    }

    /// @notice Total shares held in a stratum across a set of credentials.
    /// @dev Used by the ledger visual to size each segment of the bar.
    function stratumShares(bytes32[] calldata refs, uint8 stratumId) external view returns (uint256 total) {
        for (uint256 i = 0; i < refs.length; ++i) {
            StrataTypes.Position[] storage lots = _lots[refs[i]];
            for (uint256 j = 0; j < lots.length; ++j) {
                if (lots[j].stratumId == stratumId) total += lots[j].shares;
            }
        }
    }

    /// @notice Dry-run a withdrawal without settling it.
    /// @dev The frontend calls this to render the exit plan before the user commits, so beat 2
    ///      is visible before any transaction is signed.
    function previewExit(address account, uint128 shares)
        external
        view
        returns (StrataTypes.ExitPlan memory)
    {
        (bytes32 cviRef, uint8 tier) = credentialOf(account);
        StrataTypes.RedeemerView memory v = StrataTypes.RedeemerView({
            cviRef: cviRef,
            tier: tier,
            frozen: isFrozen(account),
            policyClears: policyClears(account),
            timestamp: uint64(block.timestamp)
        });
        return StrataResolver.resolve(v, _effectiveLots(account, cviRef), _strata, shares);
    }

    /// @dev The lot set withdraw() will actually resolve against. withdraw() calls
    ///      linkCredential() first, so a party verified after depositing is resolved against
    ///      the union of their anonymous and credentialled lots. A view that ignored that
    ///      would show BLOCKED in the interface while the chain returned ROUTED, which means
    ///      the demo would display a number the contract does not honour.
    function _effectiveLots(address account, bytes32 cviRef)
        internal
        view
        returns (StrataTypes.Position[] memory merged)
    {
        bytes32 openRef = keccak256(abi.encodePacked("strata.open", account));
        StrataTypes.Position[] storage own = _lots[cviRef];
        if (cviRef == openRef) return own;

        StrataTypes.Position[] storage anon = _lots[openRef];
        merged = new StrataTypes.Position[](own.length + anon.length);
        for (uint256 i = 0; i < own.length; ++i) {
            merged[i] = own[i];
        }
        for (uint256 j = 0; j < anon.length; ++j) {
            // Restamped onto the credential, exactly as linkCredential would attribute it.
            merged[own.length + j] = StrataTypes.Position({
                cviRef: cviRef,
                shares: anon[j].shares,
                stratumId: anon[j].stratumId,
                aTokenBacked: anon[j].aTokenBacked
            });
        }
    }

    // ---------------------------------------------------------------------
    // Transfer restriction
    // ---------------------------------------------------------------------

    /// @notice Shares are non-transferable in ship scope.
    /// @dev A freely transferable share would let a blocked holder sell their claim to a
    ///      clean wallet and exit through it, which is precisely the restriction the pool
    ///      exists to enforce. Secondary transfer of stratified claims is the post-hackathon
    ///      matching market, and it needs its own compliance path rather than a silent one.
    function _update(address from, address to, uint256 value) internal override {
        if (from != address(0) && to != address(0)) revert SharesAreNonTransferable();
        super._update(from, to, value);
    }

    /// @notice Mirrors the decimals of the underlying asset (6 for aUSDC).
    function decimals() public view override returns (uint8) {
        return IERC20Metadata(address(asset)).decimals();
    }
}

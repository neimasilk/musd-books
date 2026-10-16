// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IERC20Minimal {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
}

interface IERC20PermitMinimal {
    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external;
}

/// @title MusdPay
/// @notice Pays an ERC-20 (MUSD by default, MEZO or any other token also works) from the
///         caller to a merchant and attaches an invoice or order reference to the payment.
///
///         Mezo has no memo precompile, so a plain `transfer` carries no reference. MusdPay
///         moves the tokens with `transferFrom` and emits `PaymentReference` as the log
///         immediately after the token's own `Transfer` log. A MUSD Books statement joins the
///         two by position, so every incoming payment reconciles to its invoice exactly.
///
///         The contract holds no funds, has no owner, no fee and no upgrade path: tokens go
///         straight from payer to merchant inside one call.
contract MusdPay {
    uint256 public constant MAX_REF_BYTES = 96;

    /// @notice Emitted directly after the token's `Transfer` log for the same payment.
    event PaymentReference(
        address indexed token,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        bytes32 refHash,
        string ref
    );

    error ZeroMerchant();
    error ZeroAmount();
    error RefTooLong();
    error TransferFailed();
    error TokenNotContract();

    /// @notice Pay `amount` of `token` to `merchant` with a reference. The payer must have
    ///         approved this contract for at least `amount` first.
    function pay(address token, address merchant, uint256 amount, string calldata ref) public {
        if (merchant == address(0)) revert ZeroMerchant();
        if (amount == 0) revert ZeroAmount();
        if (bytes(ref).length > MAX_REF_BYTES) revert RefTooLong();

        _safeTransferFrom(token, msg.sender, merchant, amount);
        emit PaymentReference(token, msg.sender, merchant, amount, keccak256(bytes(ref)), ref);
    }

    /// @notice Same as `pay`, but the approval is granted by an EIP-2612 permit signature, so
    ///         the payer needs a single transaction. If the permit was already used (for
    ///         example by someone relaying the signature first) the payment still goes through
    ///         as long as the allowance is sufficient.
    function payWithPermit(
        address token,
        address merchant,
        uint256 amount,
        string calldata ref,
        uint256 deadline,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) external {
        try IERC20PermitMinimal(token).permit(msg.sender, address(this), amount, deadline, v, r, s) {} catch {}
        pay(token, merchant, amount, ref);
    }

    function _safeTransferFrom(address token, address from, address to, uint256 amount) private {
        if (token.code.length == 0) revert TokenNotContract();
        (bool ok, bytes memory ret) =
            token.call(abi.encodeWithSelector(IERC20Minimal.transferFrom.selector, from, to, amount));
        if (!ok || (ret.length != 0 && !abi.decode(ret, (bool)))) revert TransferFailed();
    }
}

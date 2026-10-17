// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {MusdPay} from "../src/MusdPay.sol";

interface IReceiverHook {
    function onTokenReceived(address from, uint256 amount) external;
}

/// @dev ERC-777-style token: after moving the balance it calls a hook on the receiver.
///      MUSD and MEZO are plain ERC-20s without hooks; this mock exists to show what the
///      log order looks like if someone pays with a hook token.
contract MockHookToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        if (to.code.length > 0) IReceiverHook(to).onTokenReceived(from, amount);
        return true;
    }
}

/// @dev A merchant contract that pays a second invoice from inside the hook.
contract ReentrantMerchant is IReceiverHook {
    MusdPay public pay;
    MockHookToken public token;
    address public sink;
    bool private entered;

    constructor(MusdPay _pay, MockHookToken _token, address _sink) {
        pay = _pay;
        token = _token;
        sink = _sink;
    }

    function onTokenReceived(address, uint256) external override {
        if (entered) return;
        entered = true;
        // the merchant (a contract) pays `sink` one unit with its own reference, inside the hook
        token.approve(address(pay), 1);
        pay.pay(address(token), sink, 1, "inner");
    }
}

/// @dev Documents a property that holds for plain ERC-20s but not for hook tokens: with a hook,
///      a reentrant payment can sit between a payment's Transfer log and its PaymentReference log.
///      The statement engine joins the two by log position and requires payer, merchant and
///      amount to match, so the outer payment then shows up as a plain transfer instead of a
///      referenced payment. Funds are never at risk (see AUDIT-NOTES.md, finding I-1).
contract MusdPayHookTokenTest is Test {
    MusdPay pay;
    MockHookToken token;

    bytes32 constant TRANSFER_SIG = keccak256("Transfer(address,address,uint256)");
    bytes32 constant REFERENCE_SIG = keccak256("PaymentReference(address,address,address,uint256,bytes32,string)");

    function setUp() public {
        pay = new MusdPay();
        token = new MockHookToken();
    }

    function test_hookToken_reentrantPaymentSplitsTransferFromItsReference() public {
        address payer = address(0xA11CE);
        address sink = address(0x51);
        ReentrantMerchant merchant = new ReentrantMerchant(pay, token, sink);

        token.mint(payer, 100);
        token.mint(address(merchant), 1); // the merchant needs one unit to pay the inner invoice
        vm.prank(payer);
        token.approve(address(pay), 100);

        vm.recordLogs();
        vm.prank(payer);
        pay.pay(address(token), address(merchant), 10, "outer");
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // Transfer(outer), Transfer(inner), PaymentReference(inner), PaymentReference(outer)
        assertEq(logs.length, 4);
        assertEq(logs[0].topics[0], TRANSFER_SIG);
        assertEq(logs[1].topics[0], TRANSFER_SIG);
        assertEq(logs[2].topics[0], REFERENCE_SIG);
        assertEq(logs[3].topics[0], REFERENCE_SIG);
        // the reference that follows the first Transfer is the inner one, not the outer payment's
        assertEq(address(uint160(uint256(logs[2].topics[2]))), address(merchant)); // payer of the inner payment
        assertEq(address(uint160(uint256(logs[3].topics[2]))), payer); // payer of the outer payment

        // funds are exact either way
        assertEq(token.balanceOf(payer), 90);
        assertEq(token.balanceOf(address(merchant)), 10);
        assertEq(token.balanceOf(sink), 1);
        assertEq(token.balanceOf(address(pay)), 0);
    }
}

// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {MusdPay} from "../src/MusdPay.sol";
import {MockMusd} from "./MusdPay.t.sol";

/// @dev Property tests for MusdPay: tokens only ever move from the caller to the merchant, the
///      reference log always comes right after the token's own Transfer log, and the contract
///      never holds tokens.
contract MusdPayFuzzTest is Test {
    MusdPay pay;
    MockMusd musd;

    bytes32 constant TRANSFER_SIG = keccak256("Transfer(address,address,uint256)");
    bytes32 constant REFERENCE_SIG = keccak256("PaymentReference(address,address,address,uint256,bytes32,string)");

    function setUp() public {
        pay = new MusdPay();
        musd = new MockMusd();
    }

    function _ref(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; ++i) {
            b[i] = bytes1(uint8(97 + (i % 26)));
        }
        return string(b);
    }

    function _validActor(address a) internal view returns (bool) {
        return a != address(0) && a != address(pay) && a != address(musd) && a != address(vm);
    }

    function testFuzz_pay_conservesTokensAndKeepsLogOrder(
        address payer,
        address merchant,
        uint96 balanceSeed,
        uint96 amountSeed,
        uint8 refLenSeed
    ) public {
        vm.assume(_validActor(payer) && _validActor(merchant) && payer != merchant);
        uint256 amount = bound(amountSeed, 1, type(uint96).max);
        uint256 balance = bound(balanceSeed, amount, type(uint96).max);
        string memory ref = _ref(bound(refLenSeed, 0, 96));

        musd.mint(payer, balance);
        vm.prank(payer);
        musd.approve(address(pay), amount);

        vm.recordLogs();
        vm.prank(payer);
        pay.pay(address(musd), merchant, amount, ref);
        Vm.Log[] memory logs = vm.getRecordedLogs();

        // exactly two logs: the token's Transfer, then the PaymentReference right after it
        assertEq(logs.length, 2, "log count");
        assertEq(logs[0].emitter, address(musd));
        assertEq(logs[0].topics[0], TRANSFER_SIG);
        assertEq(logs[1].emitter, address(pay));
        assertEq(logs[1].topics[0], REFERENCE_SIG);
        assertEq(address(uint160(uint256(logs[1].topics[1]))), address(musd));
        assertEq(address(uint160(uint256(logs[1].topics[2]))), payer);
        assertEq(address(uint160(uint256(logs[1].topics[3]))), merchant);
        (uint256 loggedAmount, bytes32 refHash, string memory loggedRef) =
            abi.decode(logs[1].data, (uint256, bytes32, string));
        assertEq(loggedAmount, amount);
        assertEq(refHash, keccak256(bytes(ref)));
        assertEq(loggedRef, ref);

        // balances: nothing created, nothing stuck in the contract, allowance fully used
        assertEq(musd.balanceOf(payer), balance - amount);
        assertEq(musd.balanceOf(merchant), amount);
        assertEq(musd.balanceOf(address(pay)), 0);
        assertEq(musd.allowance(payer, address(pay)), 0);
    }

    function testFuzz_pay_cannotSpendAnotherPayersApproval(
        address victim,
        address attacker,
        address merchant,
        uint96 amountSeed
    ) public {
        vm.assume(_validActor(victim) && _validActor(attacker) && _validActor(merchant));
        vm.assume(victim != attacker && victim != merchant);
        uint256 amount = bound(amountSeed, 1, type(uint96).max);

        musd.mint(victim, amount);
        vm.prank(victim);
        musd.approve(address(pay), type(uint256).max);

        // the contract always pulls from msg.sender, so the attacker cannot reach the victim's funds
        vm.prank(attacker);
        vm.expectRevert(MusdPay.TransferFailed.selector);
        pay.pay(address(musd), merchant, amount, "steal");

        assertEq(musd.balanceOf(victim), amount);
        assertEq(musd.balanceOf(merchant), 0);
    }

    function testFuzz_payWithPermit_garbageSignatureCannotCreateAllowance(
        address payer,
        address merchant,
        uint96 amountSeed,
        uint8 v,
        bytes32 r,
        bytes32 s
    ) public {
        vm.assume(_validActor(payer) && _validActor(merchant) && payer != merchant);
        uint256 amount = bound(amountSeed, 1, type(uint96).max);
        musd.mint(payer, amount);

        // no allowance and no valid permit: the call must revert and the payer keeps the funds
        vm.prank(payer);
        vm.expectRevert(MusdPay.TransferFailed.selector);
        pay.payWithPermit(address(musd), merchant, amount, "x", block.timestamp + 1 hours, v, r, s);

        assertEq(musd.balanceOf(payer), amount);
        assertEq(musd.allowance(payer, address(pay)), 0);
    }

    function testFuzz_pay_rejectsLongReferences(uint16 extra) public {
        uint256 len = 97 + uint256(extra % 500);
        musd.mint(address(this), 1);
        musd.approve(address(pay), 1);
        string memory longRef = _ref(len);
        vm.expectRevert(MusdPay.RefTooLong.selector);
        pay.pay(address(musd), address(0x1234), 1, longRef);
    }
}

/// @dev Drives MusdPay with random payments between a fixed set of actors.
contract MusdPayHandler is Test {
    MusdPay public immutable pay;
    MockMusd public immutable musd;
    address[] public actors;
    uint256 public totalMinted;
    uint256 public payments;

    constructor(MusdPay _pay, MockMusd _musd) {
        pay = _pay;
        musd = _musd;
        for (uint256 i = 0; i < 4; ++i) {
            address a = address(uint160(0xA000 + i));
            actors.push(a);
            _musd.mint(a, 1_000_000 ether);
            totalMinted += 1_000_000 ether;
            vm.prank(a);
            _musd.approve(address(_pay), type(uint256).max);
        }
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function pay_(uint256 fromSeed, uint256 toSeed, uint256 amountSeed, uint8 refLen) external {
        address from = actors[fromSeed % actors.length];
        address to = actors[toSeed % actors.length];
        uint256 amount = bound(amountSeed, 1, musd.balanceOf(from) == 0 ? 1 : musd.balanceOf(from));
        bytes memory b = new bytes(refLen % 97);
        for (uint256 i = 0; i < b.length; ++i) {
            b[i] = "r";
        }
        vm.prank(from);
        try pay.pay(address(musd), to, amount, string(b)) {
            ++payments;
        } catch {}
    }
}

contract MusdPayInvariantTest is StdInvariant, Test {
    MusdPay pay;
    MockMusd musd;
    MusdPayHandler handler;

    function setUp() public {
        pay = new MusdPay();
        musd = new MockMusd();
        handler = new MusdPayHandler(pay, musd);
        targetContract(address(handler));
    }

    /// @dev MusdPay never custodies tokens.
    function invariant_contractHoldsNothing() public view {
        assertEq(musd.balanceOf(address(pay)), 0);
    }

    /// @dev Payments only move tokens between the actors; the total never changes.
    function invariant_supplyIsConserved() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.actorCount(); ++i) {
            sum += musd.balanceOf(handler.actors(i));
        }
        assertEq(sum, handler.totalMinted());
    }
}

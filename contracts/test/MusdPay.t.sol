// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MusdPay} from "../src/MusdPay.sol";

/// @dev Minimal 18-decimal ERC-20 with EIP-2612 permit, standing in for MUSD in unit tests.
contract MockMusd {
    string public constant name = "Mock MUSD";
    string public constant symbol = "MUSD";
    uint8 public constant decimals = 18;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    mapping(address => uint256) public nonces;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    bytes32 public constant PERMIT_TYPEHASH =
        keccak256("Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)");

    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        return keccak256(
            abi.encode(
                keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
                keccak256(bytes(name)),
                keccak256(bytes("1")),
                block.chainid,
                address(this)
            )
        );
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 a = allowance[from][msg.sender];
        require(a >= amount, "allowance");
        allowance[from][msg.sender] = a - amount;
        require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
        return true;
    }

    function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)
        external
    {
        require(block.timestamp <= deadline, "expired");
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                DOMAIN_SEPARATOR(),
                keccak256(abi.encode(PERMIT_TYPEHASH, owner, spender, value, nonces[owner]++, deadline))
            )
        );
        require(ecrecover(digest, v, r, s) == owner, "bad signature");
        allowance[owner][spender] = value;
        emit Approval(owner, spender, value);
    }
}

/// @dev Token whose transferFrom returns nothing, like some older ERC-20s.
contract MockNoReturnToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external {
        allowance[msg.sender][spender] = amount;
    }

    function transferFrom(address from, address to, uint256 amount) external {
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

contract MusdPayTest is Test {
    MusdPay pay;
    MockMusd musd;

    uint256 payerKey = 0xA11CE;
    address payer;
    address merchant = address(0x3E7C);

    event PaymentReference(
        address indexed token,
        address indexed payer,
        address indexed merchant,
        uint256 amount,
        bytes32 refHash,
        string ref
    );
    event Transfer(address indexed from, address indexed to, uint256 value);

    function setUp() public {
        pay = new MusdPay();
        musd = new MockMusd();
        payer = vm.addr(payerKey);
        musd.mint(payer, 1_000 ether);
    }

    function test_pay_movesTokensAndEmitsReferenceAfterTransfer() public {
        vm.prank(payer);
        musd.approve(address(pay), 250 ether);

        // The token's Transfer log must come first, then PaymentReference right after it.
        vm.expectEmit(true, true, false, true, address(musd));
        emit Transfer(payer, merchant, 250 ether);
        vm.expectEmit(true, true, true, true, address(pay));
        emit PaymentReference(address(musd), payer, merchant, 250 ether, keccak256("INV-2026-0042"), "INV-2026-0042");

        vm.prank(payer);
        pay.pay(address(musd), merchant, 250 ether, "INV-2026-0042");

        assertEq(musd.balanceOf(merchant), 250 ether);
        assertEq(musd.balanceOf(payer), 750 ether);
        assertEq(musd.balanceOf(address(pay)), 0);
    }

    function test_pay_emptyReferenceIsAllowed() public {
        vm.prank(payer);
        musd.approve(address(pay), 1 ether);
        vm.prank(payer);
        pay.pay(address(musd), merchant, 1 ether, "");
        assertEq(musd.balanceOf(merchant), 1 ether);
    }

    function test_pay_revertsOnBadInputs() public {
        vm.startPrank(payer);
        musd.approve(address(pay), 10 ether);

        vm.expectRevert(MusdPay.ZeroMerchant.selector);
        pay.pay(address(musd), address(0), 1 ether, "x");

        vm.expectRevert(MusdPay.ZeroAmount.selector);
        pay.pay(address(musd), merchant, 0, "x");

        vm.expectRevert(MusdPay.RefTooLong.selector);
        pay.pay(address(musd), merchant, 1 ether, string(new bytes(97)));

        vm.expectRevert(MusdPay.TokenNotContract.selector);
        pay.pay(address(0xBEEF), merchant, 1 ether, "x");
        vm.stopPrank();
    }

    function test_pay_revertsWithoutAllowance() public {
        vm.prank(payer);
        vm.expectRevert(MusdPay.TransferFailed.selector);
        pay.pay(address(musd), merchant, 1 ether, "x");
    }

    function test_pay_worksWithTokenThatReturnsNothing() public {
        MockNoReturnToken t = new MockNoReturnToken();
        t.mint(payer, 5 ether);
        vm.startPrank(payer);
        t.approve(address(pay), 5 ether);
        pay.pay(address(t), merchant, 5 ether, "legacy");
        vm.stopPrank();
        assertEq(t.balanceOf(merchant), 5 ether);
    }

    function _signPermit(uint256 key, address owner, uint256 value, uint256 deadline)
        internal
        view
        returns (uint8 v, bytes32 r, bytes32 s)
    {
        bytes32 digest = keccak256(
            abi.encodePacked(
                "\x19\x01",
                musd.DOMAIN_SEPARATOR(),
                keccak256(
                    abi.encode(musd.PERMIT_TYPEHASH(), owner, address(pay), value, musd.nonces(owner), deadline)
                )
            )
        );
        (v, r, s) = vm.sign(key, digest);
    }

    function test_payWithPermit_singleTransaction() public {
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(payerKey, payer, 40 ether, block.timestamp + 1 hours);
        vm.prank(payer);
        pay.payWithPermit(address(musd), merchant, 40 ether, "INV-7", block.timestamp + 1 hours, v, r, s);
        assertEq(musd.balanceOf(merchant), 40 ether);
        assertEq(musd.allowance(payer, address(pay)), 0);
    }

    function test_payWithPermit_signatureAlreadyUsedByARelayer() public {
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(payerKey, payer, 40 ether, block.timestamp + 1 hours);
        // Someone submits the signature first; the payment must still go through.
        musd.permit(payer, address(pay), 40 ether, block.timestamp + 1 hours, v, r, s);
        vm.prank(payer);
        pay.payWithPermit(address(musd), merchant, 40 ether, "INV-8", block.timestamp + 1 hours, v, r, s);
        assertEq(musd.balanceOf(merchant), 40 ether);
    }

    function test_payWithPermit_revertsWhenNeitherPermitNorAllowanceIsValid() public {
        (uint8 v, bytes32 r, bytes32 s) = _signPermit(payerKey, payer, 40 ether, block.timestamp + 1 hours);
        vm.prank(payer);
        vm.expectRevert(MusdPay.TransferFailed.selector);
        // Amount differs from what was signed, so the permit fails and no allowance exists.
        pay.payWithPermit(address(musd), merchant, 41 ether, "INV-9", block.timestamp + 1 hours, v, r, s);
    }
}

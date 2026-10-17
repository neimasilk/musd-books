// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test, stdError} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {StatementRegistry} from "../src/StatementRegistry.sol";

/// @dev Property tests for StatementRegistry.
contract StatementRegistryFuzzTest is Test {
    StatementRegistry reg;

    function setUp() public {
        reg = new StatementRegistry();
        vm.roll(1_000_000);
    }

    function _label(uint256 n) internal pure returns (string memory) {
        bytes memory b = new bytes(n);
        for (uint256 i = 0; i < n; ++i) {
            b[i] = "l";
        }
        return string(b);
    }

    function testFuzz_anchor_roundTrip(
        bytes32 h,
        address account,
        address token,
        uint64 toSeed,
        address attester,
        uint8 labelLenSeed
    ) public {
        vm.assume(h != bytes32(0) && account != address(0) && token != address(0));
        uint64 to = uint64(bound(toSeed, 1, block.number - 1));
        string memory label = _label(bound(labelLenSeed, 0, 96));

        vm.prank(attester);
        reg.anchor(h, account, token, to - 1, to, label);

        assertEq(reg.anchorCount(h), 1);
        assertEq(reg.totalAnchors(), 1);
        assertTrue(reg.attested(h, attester));

        StatementRegistry.Anchor[] memory a = reg.getAnchors(h);
        assertEq(a.length, 1);
        assertEq(a[0].attester, attester);
        assertEq(a[0].account, account);
        assertEq(a[0].token, token);
        assertEq(a[0].fromBlock, to - 1);
        assertEq(a[0].toBlock, to);
        assertEq(a[0].anchoredAt, uint64(block.number));
        assertEq(a[0].label, label);

        (bytes32[] memory page, uint256 total) = reg.statementsOf(account, 0, 10);
        assertEq(total, 1);
        assertEq(page.length, 1);
        assertEq(page[0], h);
    }

    function testFuzz_anchor_duplicateAndCoAttest(bytes32 h, address account, address attester) public {
        vm.assume(h != bytes32(0) && account != address(0));
        address token = address(0xB1);

        vm.prank(attester);
        reg.anchor(h, account, token, 0, 1, "first");

        // the same party cannot attest the same hash twice
        vm.prank(attester);
        vm.expectRevert(StatementRegistry.AlreadyAttested.selector);
        reg.anchor(h, account, token, 0, 1, "again");

        // a second party can co-attest; the account's list still holds the hash once
        address other = attester == address(0xC0FFEE) ? address(0xC0FFEF) : address(0xC0FFEE);
        vm.prank(other);
        reg.anchor(h, account, token, 0, 1, "co-sign");
        assertEq(reg.anchorCount(h), 2);
        assertEq(reg.totalAnchors(), 2);
        (, uint256 listed) = reg.statementsOf(account, 0, 10);
        assertEq(listed, 1);
    }

    function testFuzz_anchor_rejectsRangesThatEndInTheFuture(uint32 add) public {
        // a range ending at the current block or later is rejected, so anchors only cover finished blocks
        uint64 future = uint64(block.number) + uint64(add);
        vm.expectRevert(StatementRegistry.RangeInFuture.selector);
        reg.anchor(bytes32(uint256(1)), address(0xA1), address(0xB1), 0, future, "");
    }

    function testFuzz_anchor_rejectsInvertedRanges(uint64 fromSeed, uint64 toSeed) public {
        uint64 from = uint64(bound(fromSeed, 1, block.number - 1));
        uint64 to = uint64(bound(toSeed, 0, from - 1));
        vm.expectRevert(StatementRegistry.InvalidRange.selector);
        reg.anchor(bytes32(uint256(1)), address(0xA1), address(0xB1), from, to, "");
    }

    function testFuzz_anchor_rejectsLongLabels(uint8 extra) public {
        string memory long = _label(97 + uint256(extra));
        vm.expectRevert(StatementRegistry.LabelTooLong.selector);
        reg.anchor(bytes32(uint256(1)), address(0xA1), address(0xB1), 0, 1, long);
    }

    function testFuzz_statementsOf_pagination(uint8 nSeed, uint8 offset, uint8 limit) public {
        uint256 n = bound(nSeed, 0, 40);
        address account = address(0xACC0);
        for (uint256 i = 0; i < n; ++i) {
            reg.anchor(bytes32(uint256(i + 1)), account, address(0xB1), 0, 1, "");
        }
        (bytes32[] memory page, uint256 total) = reg.statementsOf(account, offset, limit);
        assertEq(total, n);
        uint256 expectedLen = offset >= n ? 0 : (uint256(limit) > n - offset ? n - offset : uint256(limit));
        assertEq(page.length, expectedLen);
        for (uint256 i = 0; i < page.length; ++i) {
            assertEq(page[i], bytes32(uint256(offset) + i + 1));
        }
    }

    /// @dev Known low-severity edge case (see AUDIT-NOTES.md, finding L-1): `offset + limit`
    ///      overflows for a huge `limit`, so the view call reverts instead of returning the tail.
    ///      No funds or state are involved and the app always passes a small limit. This test
    ///      pins the current behaviour so a future fix has to update it on purpose.
    function test_knownIssue_statementsOf_hugeLimitRevertsOnOverflow() public {
        address account = address(0xACC0);
        reg.anchor(bytes32(uint256(1)), account, address(0xB1), 0, 1, "");
        reg.anchor(bytes32(uint256(2)), account, address(0xB1), 0, 1, "");
        vm.expectRevert(stdError.arithmeticError);
        reg.statementsOf(account, 1, type(uint256).max);
    }
}

contract RegistryHandler is Test {
    StatementRegistry public immutable reg;
    uint256 public ghostTotal;
    bytes32[] public hashes;
    mapping(bytes32 => uint256) public ghostCount;
    mapping(bytes32 => mapping(address => bool)) public ghostAttested;

    constructor(StatementRegistry _reg) {
        reg = _reg;
    }

    function hashCount() external view returns (uint256) {
        return hashes.length;
    }

    function anchor(uint256 hashSeed, uint256 attesterSeed, uint256 accountSeed) external {
        bytes32 h = bytes32(uint256(hashSeed % 6) + 1);
        address attester = address(uint160(0xB000 + (attesterSeed % 4)));
        address account = address(uint160(0xC000 + (accountSeed % 3)));
        vm.prank(attester);
        try reg.anchor(h, account, address(0xD1), 0, 1, "") {
            if (ghostCount[h] == 0) hashes.push(h);
            ++ghostCount[h];
            ++ghostTotal;
            ghostAttested[h][attester] = true;
        } catch {}
    }
}

contract StatementRegistryInvariantTest is StdInvariant, Test {
    StatementRegistry reg;
    RegistryHandler handler;

    function setUp() public {
        reg = new StatementRegistry();
        vm.roll(100);
        handler = new RegistryHandler(reg);
        targetContract(address(handler));
    }

    /// @dev The running total equals the number of successful anchor calls.
    function invariant_totalMatchesSuccessfulAnchors() public view {
        assertEq(reg.totalAnchors(), handler.ghostTotal());
    }

    /// @dev Per-hash anchor counts equal the successful calls, and nobody is recorded twice.
    function invariant_perHashCountsMatch() public view {
        uint256 sum;
        for (uint256 i = 0; i < handler.hashCount(); ++i) {
            bytes32 h = handler.hashes(i);
            assertEq(reg.anchorCount(h), handler.ghostCount(h));
            StatementRegistry.Anchor[] memory a = reg.getAnchors(h);
            for (uint256 j = 0; j < a.length; ++j) {
                assertTrue(reg.attested(h, a[j].attester));
                for (uint256 k = j + 1; k < a.length; ++k) {
                    assertTrue(a[j].attester != a[k].attester);
                }
            }
            sum += a.length;
        }
        assertEq(sum, reg.totalAnchors());
    }
}

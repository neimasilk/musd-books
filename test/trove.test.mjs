// Offline unit test of getTroveSnapshot, troveRisk and planTroveChange (no network).
// Pins the Wave 1 review finding: getEntireDebtAndColl already includes pending redistribution rewards,
// so the snapshot must not add them a second time. Also covers Recovery Mode and the repay limits.
import { getTroveSnapshot, troveRisk, planTroveChange, troveStepOrder, ratioPct, buildLenderReport, MEZO_TESTNET, MEZO_MAINNET, MCR, GAS_COMPENSATION, MIN_NET_DEBT } from '../docs/engine.js';

let bad = 0;
const check = (name, ok, extra = '') => { console.log(ok ? 'PASS' : 'FAIL', name, ok ? '' : extra); if (!ok) bad++; };
const E = 10n ** 18n;
const ACCOUNT = '0x444156722777F12f29F789F04fe9EAA5e90B10a9';
const word = (v) => v.toString(16).padStart(64, '0');
const words = (...vs) => '0x' + vs.map(word).join('');

/** Fake TroveManager + PriceFeed answering by selector, as the real contracts do (values already include pending). */
function fakeRpc({ status = 1n, coll, principal, interest, pColl = 0n, pPrin = 0n, pInt = 0n, price = 80_000n * E, tcr = 2n * E, recovery = false }) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push(params[0].data.slice(0, 10));
    const d = params[0].data;
    if (d.startsWith('0x21e37801')) return words(status);
    if (d.startsWith('0xb91af97c')) return words(coll, principal, interest, pColl, pPrin, pInt);
    if (d.startsWith('0x92b7659b')) return words(100n);
    if (d === '0x0fdb11cf') return words(price);
    if (d.startsWith('0xd293c710')) return words((coll * price) / (principal + interest));
    if (d.startsWith('0xb82f263d')) return words(tcr);
    if (d.startsWith('0x4e443d9e')) return words(recovery ? 1n : 0n);
    throw new Error('unexpected selector ' + d.slice(0, 10));
  };
  rpc.calls = calls;
  return rpc;
}

// A Trove whose totals (as returned by the contract) already include 10 MUSD + 0.001 BTC of pending rewards.
const base = { coll: E / 20n, principal: 2000n * E, interest: 5n * E, pColl: E / 1000n, pPrin: 9n * E, pInt: 1n * E };
const t = await getTroveSnapshot(fakeRpc(base), MEZO_TESTNET, ACCOUNT);
check('collateral is taken as returned, pending not added again', t.coll === E / 20n, String(t.coll));
check('debt is principal + interest as returned, pending not added again', t.debt === 2005n * E, String(t.debt));
check('pending parts are kept for information', t.pendingColl === E / 1000n && t.pendingDebt === 10n * E);
check('liquidation price = debt * 110% / collateral', t.liquidationPrice === (2005n * E * MCR) / (E / 20n));
check('system TCR and mode are read', t.tcr === 2n * E && t.recoveryMode === false);

const r = troveRisk(t);
check('ICR in percent', Math.abs(r.icrPct - (Number((E / 20n) * 80_000n * E / (2005n * E)) / 1e16)) < 1e-9);
check('BTC fall to liquidation is 1 - liqPrice/price', Math.abs(r.fallPct - (1 - Number(t.liquidationPrice) / Number(80_000n * E)) * 100) < 1e-9);
check('distance to Recovery Mode at TCR 200% is 25%', Math.abs(r.recoveryFallPct - 25) < 1e-9);

const tr = await getTroveSnapshot(fakeRpc({ ...base, tcr: 14n * E / 10n, recovery: true }), MEZO_TESTNET, ACCOUNT);
check('Recovery Mode is detected', tr.recoveryMode === true);
const md = buildLenderReport({ net: MEZO_TESTNET, summary: { decimals: 18, symbol: 'MUSD', chainId: 31611, account: ACCOUNT, token: MEZO_TESTNET.tokens.MUSD.address, fromBlock: 1, toBlock: 2, count: 0, opening: 0n, totalIn: 0n, totalOut: 0n, closing: 0n, unexplained: 0n }, hash: '0x' + '1'.repeat(64), trove: tr });
check('report states Recovery Mode and what it restricts', md.includes('RECOVERY MODE') && md.includes('cannot withdraw collateral') && md.includes('Repaying and adding collateral are always allowed'));
check('report keeps the 110% line in both modes', md.includes('Liquidation applies below 110% (in Normal and Recovery Mode alike)'));
check('report names the redistributed part as included, not extra', md.includes('Included above: 10 MUSD of debt and 0.001 BTC'));

check('closed Trove returns a snapshot without price reads', (await getTroveSnapshot(fakeRpc({ ...base, status: 2n }), MEZO_TESTNET, ACCOUNT)).active === false);
check('no Trove returns null', (await getTroveSnapshot(fakeRpc({ ...base, status: 0n }), MEZO_TESTNET, ACCOUNT)) === null);

// planTroveChange: same limits as BorrowerOperations.
const snap = { active: true, coll: E / 20n, principal: 2400n * E, interest: 3n * E, debt: 2403n * E, price: 80_000n * E };
const maxRepay = 2403n * E - GAS_COMPENSATION - MIN_NET_DEBT; // 403 MUSD
let p = planTroveChange(snap, { repay: 100n * E });
check('repay goes to interest first, then principal', p.errors.length === 0 && p.newInterest === 0n && p.newPrincipal === 2303n * E && p.newDebt === 2303n * E);
check('max repay keeps net debt at the minimum', p.maxRepay === maxRepay);
check('repaying more than the max is refused with a reason', planTroveChange(snap, { repay: maxRepay + 1n }).errors.some((e) => e.includes('At most 403 MUSD')));
check('repaying exactly the max is allowed', planTroveChange(snap, { repay: maxRepay }).errors.length === 0);
check('repaying more than the wallet holds is refused', planTroveChange(snap, { repay: 10n * E, musdBalance: 5n * E }).errors.some((e) => e.includes('wallet holds 5 MUSD')));
p = planTroveChange(snap, { addColl: E / 100n });
check('adding collateral raises the ratio and lowers the liquidation price', p.errors.length === 0 && p.newIcr > (snap.coll * snap.price) / snap.debt && p.newLiquidationPrice < (snap.debt * MCR) / snap.coll);
check('nominal ratio for the hint is coll * 1e20 / principal', p.nicr === ((E / 20n + E / 100n) * 10n ** 20n) / (2400n * E));
check('an empty change is refused', planTroveChange(snap, {}).errors.includes('Enter an amount.'));
check('no Trove is refused', planTroveChange(null, { repay: 1n }).errors.includes('This account has no active Trove.'));

// The 110% rule (BorrowerOperations._adjustTrove: newICR = newColl * price / newDebt, Normal Mode requires newICR >= MCR,
// even for a pure repayment or top-up; Recovery Mode lets a pure repayment or top-up through).
check('MCR is 110% (LiquityBase MCR = 1.1e18)', MCR === 1_100_000_000_000_000_000n);
check('ratioPct rounds down, so just under 110% never reads 110.00%', ratioPct(MCR - 1n) === '109.99' && ratioPct(MCR) === '110.00' && ratioPct(2n * E) === '200.00');
// 0.03 BTC at $80,000 = $2,400 against 2,403 MUSD of debt: ICR 99.87%, open to liquidation.
const low = { active: true, coll: 3n * E / 100n, principal: 2400n * E, interest: 3n * E, debt: 2403n * E, price: 80_000n * E, recoveryMode: false };
const icrAfter = (coll, debt) => (coll * low.price) / debt;
p = planTroveChange(low, { repay: 100n * E });
check('Normal Mode: a repayment that leaves the ratio below 110% is refused, with the new ratio',
  p.mcrBlocked && p.belowMcr && p.newIcr === icrAfter(low.coll, 2303n * E) && p.errors.some((e) => e.includes(`would be ${ratioPct(p.newIcr)}%`) && e.includes('below Mezo\'s 110% minimum')));
// collateral needed at the current debt: ceil(2403 * 1.1 / 80000 BTC) - 0.03 = 0.0030412500 - rounded up to 8 decimals = 0.00304125
check('the refusal names the top-up that reaches 110% on its own (rounded up to 8 decimals)', p.errors.some((e) => e.includes('at least 0.00304125 BTC')));
const needed = 304125n * 10n ** 10n;
check('that top-up really reaches 110% and one unit of 8 decimals less does not',
  icrAfter(low.coll + needed, low.debt) >= MCR && icrAfter(low.coll + needed - 10n ** 10n, low.debt) < MCR);
p = planTroveChange(low, { addColl: needed });
check('Normal Mode: a top-up that reaches 110% passes', p.errors.length === 0 && !p.belowMcr && p.newIcr >= MCR);
p = planTroveChange(low, { addColl: needed - 10n ** 10n });
check('Normal Mode: a top-up that stays just below 110% is refused', p.mcrBlocked && p.errors.length === 1);
p = planTroveChange({ ...low, recoveryMode: true }, { repay: 100n * E });
check('Recovery Mode: the same repayment goes through, with a warning that the Trove can still be liquidated',
  p.errors.length === 0 && p.belowMcr && !p.mcrBlocked && p.warnings.some((w) => w.includes('Recovery Mode') && w.includes('can still be liquidated')));
p = planTroveChange({ ...low, recoveryMode: undefined }, { repay: 100n * E });
check('an unknown mode is treated as Normal Mode (the stricter rule)', p.mcrBlocked);
p = planTroveChange({ ...low, price: undefined }, { repay: 100n * E });
check('without a price the ratio is not checked here and the preview says so', p.errors.length === 0 && p.newIcr === null && p.warnings.some((w) => w.includes('could not be read')));
check('a healthy Trove gets no 110% error or warning', (() => { const q = planTroveChange(snap, { repay: 100n * E }); return q.errors.length === 0 && q.warnings.length === 0 && !q.belowMcr; })());
// Two buttons = two transactions, each checked on its own.
check('step order: a healthy Trove can do either first', troveStepOrder(snap, { repay: 100n * E, addColl: E / 100n }) === 'any');
check('step order: a big enough top-up must go first when the repayment alone stays below 110%', troveStepOrder(low, { repay: 100n * E, addColl: needed }) === 'addColl');
// 0.0315 BTC: alone it reaches 104.87% (refused); after repaying 403 MUSD the ratio is 2520/2000 = 126% (repay alone: 2400/2000 = 120%).
check('step order: the repayment must go first when only it reaches 110% alone', troveStepOrder(low, { repay: 403n * E, addColl: 15n * E / 10000n }) === 'repay');
// 0.001 BTC + 200 MUSD: alone 103.2% and 108.9%, together 2480/2203 = 112.6%.
check('step order: null when neither transaction reaches 110% alone though both together would',
  !planTroveChange(low, { repay: 200n * E, addColl: E / 1000n }).mcrBlocked && troveStepOrder(low, { repay: 200n * E, addColl: E / 1000n }) === null);
check('both networks know BorrowerOperations, HintHelpers and SortedTroves',
  [MEZO_TESTNET, MEZO_MAINNET].every((n) => [n.borrowerOperations, n.hintHelpers, n.sortedTroves].every((a) => /^0x[0-9a-fA-F]{40}$/.test(a))));

console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);

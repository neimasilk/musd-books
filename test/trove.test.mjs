// Offline unit test of getTroveSnapshot, troveRisk and planTroveChange (no network).
// Pins the Wave 1 review finding: getEntireDebtAndColl already includes pending redistribution rewards,
// so the snapshot must not add them a second time. Also covers Recovery Mode and the repay limits.
import { getTroveSnapshot, troveRisk, planTroveChange, buildLenderReport, MEZO_TESTNET, MEZO_MAINNET, MCR, GAS_COMPENSATION, MIN_NET_DEBT } from '../docs/engine.js';

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
check('both networks know BorrowerOperations, HintHelpers and SortedTroves',
  [MEZO_TESTNET, MEZO_MAINNET].every((n) => [n.borrowerOperations, n.hintHelpers, n.sortedTroves].every((a) => /^0x[0-9a-fA-F]{40}$/.test(a))));

console.log(bad ? `${bad} FAILED` : 'ALL PASS');
process.exit(bad ? 1 : 0);

// Offline unit test of getStabilityPoolPosition, the withdrawFromSP pre-check and the lender-report section (no network).
import { getStabilityPoolPosition, checkStabilityPoolWithdrawal, buildLenderReport, MEZO_TESTNET, MEZO_MAINNET, MCR } from '../docs/engine.js';

let bad = 0;
const check = (name, ok) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) bad++; };
const E = 10n ** 18n;
const ACCOUNT = '0x444156722777F12f29F789F04fe9EAA5e90B10a9';
const word = (v) => '0x' + v.toString(16).padStart(64, '0');

/** A fake RPC that answers the three StabilityPool reads by selector and records every call. */
function fakeRpc({ deposit, gain, total }) {
  const calls = [];
  const rpc = async (method, params) => {
    calls.push({ method, params });
    if (method !== 'eth_call') throw new Error('unexpected ' + method);
    const { to, data } = params[0];
    if (data.startsWith('0x8c4726eb')) return word(deposit);   // getCompoundedMUSDDeposit(address)
    if (data.startsWith('0x307d3612')) return word(gain);      // getDepositorCollateralGain(address)
    if (data === '0x309077b3') return word(total);             // getTotalMUSDDeposits()
    throw new Error('unexpected selector ' + data + ' to ' + to);
  };
  rpc.calls = calls;
  return rpc;
}

const rpc = fakeRpc({ deposit: 250n * E, gain: E / 1000n, total: 10_000n * E });
const p = await getStabilityPoolPosition(rpc, MEZO_TESTNET, ACCOUNT);
check('deposit, gain and pool total are read exactly', p.deposit === 250n * E && p.collateralGain === E / 1000n && p.totalDeposits === 10_000n * E);
check('share of the pool is a percentage (250 of 10,000 = 2.5%)', Math.abs(p.sharePct - 2.5) < 1e-9);
check('all calls go to the configured StabilityPool', rpc.calls.every((c) => c.params[0].to === MEZO_TESTNET.stabilityPool));
check('the account is passed as the padded address argument', rpc.calls.filter((c) => c.params[0].data.length > 10).every((c) => c.params[0].data.endsWith(ACCOUNT.slice(2).toLowerCase())));

check('gain without a deposit is still reported (a depositor fully absorbed by liquidations can have a gain)',
  (await getStabilityPoolPosition(fakeRpc({ deposit: 0n, gain: 5n, total: E }), MEZO_TESTNET, ACCOUNT)).collateralGain === 5n);
check('no deposit and no gain returns null', (await getStabilityPoolPosition(fakeRpc({ deposit: 0n, gain: 0n, total: E }), MEZO_TESTNET, ACCOUNT)) === null);
check('an empty pool does not divide by zero', (await getStabilityPoolPosition(fakeRpc({ deposit: 1n, gain: 0n, total: 0n }), MEZO_TESTNET, ACCOUNT)).sharePct === 0);
check('invalid address returns null without calling the RPC', (await getStabilityPoolPosition(fakeRpc({ deposit: 1n, gain: 1n, total: 1n }), MEZO_TESTNET, '0x123')) === null);
check('a network without a pool configured returns null', (await getStabilityPoolPosition(fakeRpc({ deposit: 1n, gain: 1n, total: 1n }), { ...MEZO_TESTNET, stabilityPool: undefined }, ACCOUNT)) === null);
check('both networks know their StabilityPool', /^0x[0-9a-fA-F]{40}$/.test(MEZO_TESTNET.stabilityPool) && /^0x[0-9a-fA-F]{40}$/.test(MEZO_MAINNET.stabilityPool));

// withdrawFromSP pre-check: same reads as StabilityPool._requireNoUnderCollateralizedTroves
// (SortedTroves.getLast, PriceFeed.fetchPrice, TroveManager.getCurrentICR(last, price), ICR >= MCR).
const LOWEST = '0x00000000000000000000000000000000000000aa';
function fakeSystemRpc({ last = LOWEST, price = 80_000n * E, icr, stale = false }) {
  const calls = [];
  const rpc = async (method, params) => {
    const { to, data } = params[0];
    calls.push({ to, data });
    if (data === '0x4d622831') return '0x' + last.slice(2).padStart(64, '0');                // SortedTroves.getLast()
    if (data === '0x0fdb11cf') { if (stale) throw new Error('execution reverted: PriceFeed: Oracle is stale.'); return word(price); }
    if (data.startsWith('0xd293c710')) return word(icr);                                     // TroveManager.getCurrentICR(address,uint256)
    throw new Error('unexpected selector ' + data + ' to ' + to);
  };
  rpc.calls = calls;
  return rpc;
}
const hold = fakeSystemRpc({ icr: 109n * E / 100n });
const blocked = await checkStabilityPoolWithdrawal(hold, MEZO_MAINNET);
check('a lowest Trove at 109% blocks the withdrawal and is named', blocked.ok === false && blocked.lowestTrove === LOWEST && blocked.icr === 109n * E / 100n);
check('reads go to SortedTroves, PriceFeed and TroveManager of that network',
  hold.calls[0].to === MEZO_MAINNET.sortedTroves && hold.calls[1].to === MEZO_MAINNET.priceFeed && hold.calls[2].to === MEZO_MAINNET.troveManager);
check('getCurrentICR gets the lowest Trove and the fetched price as arguments',
  hold.calls[2].data === '0xd293c710' + LOWEST.slice(2).padStart(64, '0') + (80_000n * E).toString(16).padStart(64, '0'));
check('exactly 110% is allowed (the contract requires ICR >= MCR)', (await checkStabilityPoolWithdrawal(fakeSystemRpc({ icr: MCR }), MEZO_TESTNET)).ok === true);
check('one unit below 110% is refused', (await checkStabilityPoolWithdrawal(fakeSystemRpc({ icr: MCR - 1n }), MEZO_TESTNET)).ok === false);
const empty = fakeSystemRpc({ last: '0x0000000000000000000000000000000000000000', icr: 0n });
check('no Troves at all: allowed, without reading the price', (await checkStabilityPoolWithdrawal(empty, MEZO_TESTNET)).ok === true && empty.calls.length === 1);
let staleErr = '';
try { await checkStabilityPoolWithdrawal(fakeSystemRpc({ stale: true, icr: 2n * E }), MEZO_TESTNET); } catch (e) { staleErr = e.message; }
check('a stale price feed (which also makes the withdrawal revert) is passed on as an error', /stale/i.test(staleErr));
check('a network without Trove contracts returns null', (await checkStabilityPoolWithdrawal(fakeSystemRpc({ icr: 0n }), { ...MEZO_TESTNET, sortedTroves: undefined })) === null);

// report section
const summary = { chainId: 31611, account: ACCOUNT, token: MEZO_TESTNET.tokens.MUSD.address, symbol: 'MUSD', decimals: 18, fromBlock: 1, toBlock: 2, count: 0,
  opening: 0n, totalIn: 0n, totalOut: 0n, closing: 0n, unexplained: 0n, minted: 0n, burned: 0n };
const hash = '0x' + 'cd'.repeat(32);
const r = buildLenderReport({ net: MEZO_TESTNET, summary, hash, pool: p, generatedAt: new Date('2026-10-17T00:00:00Z') });
check('report has a Stability Pool section with the exact deposit', r.includes('## Mezo Stability Pool') && r.includes('Deposit (after liquidation losses): 250 MUSD, 2.5000% of the 10000 MUSD in the pool'));
check('report states the pending BTC gain', r.includes('Pending BTC gain from liquidated Troves: 0.001 BTC'));
check('report explains that pooled MUSD is not spent', r.includes('is not spent'));
const r0 = buildLenderReport({ net: MEZO_TESTNET, summary, hash, pool: null });
check('no pool position is stated plainly', r0.includes('No Stability Pool deposit or pending gain found'));
process.exit(bad ? 1 : 0);

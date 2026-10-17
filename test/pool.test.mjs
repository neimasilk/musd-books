// Offline unit test of getStabilityPoolPosition and its lender-report section (no network).
import { getStabilityPoolPosition, buildLenderReport, MEZO_TESTNET, MEZO_MAINNET } from '../docs/engine.js';

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

// Live read-only check of getStabilityPoolPosition against the real StabilityPool contracts.
// Testnet: the demo Trove owner made a real 100 MUSD deposit with scripts/pool_demo.mjs.
// Mainnet: the pool is read (a large pool total proves the selectors match the deployed contract).
import { createRpc, getStabilityPoolPosition, MEZO_TESTNET, MEZO_MAINNET, formatUnits } from '../docs/engine.js';

const OWNER = '0x444156722777F12f29F789F04fe9EAA5e90B10a9';
const NOBODY = '0x000000000000000000000000000000000000dEaD';
let bad = 0;
const check = (name, ok) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) bad++; };

const rpcT = createRpc(MEZO_TESTNET.rpcUrl);
const p = await getStabilityPoolPosition(rpcT, MEZO_TESTNET, OWNER);
check('testnet owner has a Stability Pool deposit', p !== null);
if (p) {
  console.log('  deposit', formatUnits(p.deposit, 18), 'MUSD | share', p.sharePct.toFixed(6) + '% | pool', formatUnits(p.totalDeposits, 18), '| BTC gain', formatUnits(p.collateralGain, 18));
  check('deposit is at least the 100 MUSD that was provided', p.deposit >= 100n * 10n ** 18n);
  check('the share is positive and below 100%', p.sharePct > 0 && p.sharePct < 100);
  check('the pool total includes this deposit', p.totalDeposits >= p.deposit);
}
check('an account without a deposit returns null', (await getStabilityPoolPosition(rpcT, MEZO_TESTNET, NOBODY)) === null);

const rpcM = createRpc(MEZO_MAINNET.rpcUrl);
const total = BigInt(await rpcM('eth_call', [{ to: MEZO_MAINNET.stabilityPool, data: '0x309077b3' }, 'latest']));
console.log('  mainnet pool total', formatUnits(total, 18), 'MUSD');
check('mainnet StabilityPool answers getTotalMUSDDeposits with a positive total', total > 0n);
check('mainnet read for an account without a deposit returns null without error', (await getStabilityPoolPosition(rpcM, MEZO_MAINNET, NOBODY)) === null);
process.exit(bad ? 1 : 0);

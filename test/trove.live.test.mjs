// Live read-only check of getTroveSnapshot: testnet owner from the demo, plus a mainnet Trove owner.
import { createRpc, getTroveSnapshot, MEZO_TESTNET, MEZO_MAINNET, formatUnits } from '../docs/engine.js';

const OWNER = '0x444156722777F12f29F789F04fe9EAA5e90B10a9';
let bad = 0;
const check = (name, ok) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) bad++; };

async function show(label, net, account) {
  const rpc = createRpc(net.rpcUrl);
  const t = await getTroveSnapshot(rpc, net, account);
  console.log(label, account);
  if (!t) { console.log('  no trove'); return null; }
  console.log('  status', t.status, '| coll BTC', formatUnits(t.coll, 18), '| debt MUSD', formatUnits(t.debt, 18), '| rate', t.rateBp / 100 + '%',
    t.icr ? '| ICR ' + (Number(t.icr) / 1e16).toFixed(2) + '%' : '', t.price ? '| BTC $' + formatUnits(t.price, 18).slice(0, 8) : '');
  return t;
}

const t1 = await show('testnet', MEZO_TESTNET, OWNER);
check('testnet owner has an active trove', t1 && t1.active);
check('debt = principal + interest', t1.debt === t1.principal + t1.interest);
check('ICR matches collateral value over debt (within 1e-6: interest accrues each second)', t1.icr !== undefined && (() => { const calc = (t1.coll * t1.price) / t1.debt; const diff = calc > t1.icr ? calc - t1.icr : t1.icr - calc; return diff * 10n ** 6n < t1.icr; })());
check('account without a trove returns null', (await getTroveSnapshot(createRpc(MEZO_TESTNET.rpcUrl), MEZO_TESTNET, '0x21F5ae9d165a7E0EFDaf17A85c225713199eC439')) === null);

const rpcM = createRpc(MEZO_MAINNET.rpcUrl);
const owner0 = '0x' + (await rpcM('eth_call', [{ to: MEZO_MAINNET.troveManager, data: '0x756b253e' + '0'.repeat(64) }, 'latest'])).slice(-40);
const t2 = await show('mainnet', MEZO_MAINNET, owner0);
check('mainnet first trove owner reads without error', t2 !== undefined);
if (t2 && t2.active) check('mainnet ICR above the 110% liquidation threshold', t2.icr > 11n * 10n ** 17n);
process.exit(bad ? 1 : 0);

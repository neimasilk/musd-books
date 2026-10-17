// Offline unit test of buildLenderReport (no network).
import { buildLenderReport, MEZO_TESTNET } from '../docs/engine.js';

let bad = 0;
const check = (name, ok) => { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) bad++; };
const E = 10n ** 18n;
const summary = { chainId: 31611, account: '0x444156722777F12f29F789F04fe9EAA5e90B10a9', token: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503', symbol: 'MUSD', decimals: 18,
  fromBlock: 100, toBlock: 200, count: 3, opening: 0n, totalIn: 1800n * E, totalOut: 150n * E + 5n, closing: 1650n * E - 5n, unexplained: 0n, minted: 1800n * E, burned: 150n * E };
const hash = '0x' + 'ab'.repeat(32);
const trove = { status: 'Active', active: true, coll: 368500000000000000n / 10n, principal: 2000n * E, interest: 52n * E, debt: 2052n * E, rateBp: 100,
  price: 100000n * E, collUsd: 3685n * E, icr: (3685n * E * E) / (2052n * E) };

const r = buildLenderReport({ net: MEZO_TESTNET, summary, hash, anchors: [{ attester: '0xAAA', anchoredAt: 123n, label: 'store' }, { attester: '0xBBB', anchoredAt: 124n, label: '' }], trove, generatedAt: new Date('2026-10-17T00:00:00Z'), reviewUrl: 'https://x.test/?expect=' + hash });
check('title and network', r.startsWith('# MUSD lender report') && r.includes('Mezo Testnet (chain 31611)'));
check('exact amounts, no rounding', r.includes('Money in: +1800 MUSD') && r.includes('Money out: -150.000000000000000005 MUSD'));
check('mint and burn explained', r.includes('loan draw: 1800') && r.includes('repayment: 150'));
check('reconciliation line', r.includes('fully reconciled'));
check('hash and both anchors', r.includes(hash) && r.includes('Anchored 2 time(s)') && r.includes('0xAAA at block 123 ("store")') && r.includes('0xBBB at block 124'));
check('review link included', r.includes('?expect=' + hash));
check('trove numbers', r.includes('Status: Active') && r.includes('Debt: 2052 MUSD') && r.includes('annual interest rate 1.00%'));
const icr = 3685 / 2052;
check('collateral ratio and liquidation distance', r.includes('Collateral ratio: ' + (icr * 100).toFixed(2) + '%') && r.includes('fall about ' + ((1 - 1.1 / icr) * 100).toFixed(1) + '%'));
const r2 = buildLenderReport({ net: MEZO_TESTNET, summary: { ...summary, unexplained: 7n }, hash, anchors: [], trove: null });
check('no trove and not anchored are stated plainly', r2.includes('No Trove found') && r2.includes('Not anchored in the StatementRegistry yet'));
check('a non-zero difference is flagged, never hidden', r2.includes('NOT reconciled'));
process.exit(bad ? 1 : 0);

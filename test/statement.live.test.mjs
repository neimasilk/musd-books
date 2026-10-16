// Live read-only check of the statement engine against Mezo.
// Usage: node test/statement.live.test.mjs [testnet|mainnet] [blocks] [address]
import { createRpc, buildStatement, parseCsvHeader, MEZO_TESTNET, MEZO_MAINNET, TRANSFER_TOPIC, getLogsSplit, formatUnits } from '../docs/engine.js';

const which = process.argv[2] || 'testnet';
const blocks = Number(process.argv[3] || 5000);
const net = which === 'mainnet' ? MEZO_MAINNET : MEZO_TESTNET;
const rpc = createRpc(net.rpcUrl);
const token = net.tokens.MUSD.address.toLowerCase();

const head = Number(BigInt(await rpc('eth_blockNumber', [])));
const to = head - 5; // stay clear of the tip
const from = to - blocks + 1;
console.log(`${net.name}: head ${head}, window ${from}..${to}`);

let account = process.argv[4];
if (!account) {
  const logs = await getLogsSplit(rpc, { address: token, topics: [TRANSFER_TOPIC] }, from, Math.min(to, from + 9998));
  const count = new Map();
  for (const l of logs) for (const t of [l.topics[1], l.topics[2]]) {
    const a = '0x' + t.slice(-40);
    if (a !== '0x0000000000000000000000000000000000000000') count.set(a, (count.get(a) || 0) + 1);
  }
  const top = [...count.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) { console.log('no MUSD transfers in this window; try a larger window'); process.exit(0); }
  account = top[0];
  console.log(`busiest account in window: ${account} (${top[1]} log mentions of ${logs.length} transfers)`);
}

const t0 = Date.now();
const a = await buildStatement(rpc, net, token, account, from, to);
const b = await buildStatement(rpc, net, token, account, from, to);
const s = a.summary;
const f = (v) => formatUnits(v, s.decimals);
console.log(`${s.symbol} decimals=${s.decimals} transfers=${s.count}  in=${f(s.totalIn)} out=${f(s.totalOut)} minted=${f(s.minted)} burned=${f(s.burned)}`);
console.log(`opening=${f(s.opening)} closing=${f(s.closing)} unexplained=${f(s.unexplained)}  (${Date.now() - t0} ms for two builds)`);
const kinds = {}; for (const r of a.rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
console.log('kinds:', JSON.stringify(kinds), ' labelled counterparties:', a.rows.filter((r) => r.counterpartyLabel).length);

const checks = [
  ['deterministic: two builds are byte-identical', a.csv === b.csv],
  ['reconciles exactly (unexplained == 0)', s.unexplained === 0n],
  ['opening + in - out == closing', s.opening + s.totalIn - s.totalOut === s.closing],
  ['header parses back to the same range', parseCsvHeader(a.csv).from_block === String(from) && parseCsvHeader(a.csv).account === account.toLowerCase()],
  ['running balance of last row == closing', a.rows.length === 0 || a.rows[a.rows.length - 1].running === s.closing],
];
let bad = 0;
for (const [name, ok] of checks) { console.log(ok ? 'PASS' : 'FAIL', name); if (!ok) bad++; }
process.exit(bad ? 1 : 0);

// Probe: build a real Mezo MAINNET MUSD statement (read-only, no gas) for an account and block range.
// Usage: node scripts/mainnet_statement_probe.mjs <account> <fromBlock> <toBlock>
import { createRpc, buildStatement, MEZO_MAINNET } from '../docs/engine.js';

const [account, from, to] = process.argv.slice(2);
const rpc = createRpc(MEZO_MAINNET.rpcUrl);
const st = await buildStatement(rpc, MEZO_MAINNET, MEZO_MAINNET.tokens.MUSD.address, account, Number(from), Number(to), {});
const { rows, ...rest } = st;
console.log(JSON.stringify({ ...rest, rowsCount: rows?.length }, (k, v) => (typeof v === 'bigint' ? v.toString() : v), 1).slice(0, 2500));
for (const r of (rows || []).slice(0, 12)) console.log(JSON.stringify(r, (k, v) => (typeof v === 'bigint' ? v.toString() : v)));

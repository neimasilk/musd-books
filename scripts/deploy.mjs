// Deploys StatementRegistry and MusdPay to Mezo.
// Usage: node scripts/deploy.mjs [--rpc <url>] [--fork]
//   --fork   deploys to a local fork (anvil) and writes deployments.fork.json; does not touch docs/config.js
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, parseArgs, clientsFor, artifact, root, TESTNET_RPC } from './lib.mjs';

const args = parseArgs();
const rpc = args.rpc || TESTNET_RPC;
const env = loadEnv();
if (!env.MEZO_TESTNET_KEY) throw new Error('MEZO_TESTNET_KEY missing from .env');
const { pub, wallet, account } = clientsFor(rpc, env.MEZO_TESTNET_KEY);

const bal = await pub.getBalance({ address: account.address });
console.log(`deployer ${account.address}  balance ${Number(bal) / 1e18} BTC (gas token)`);
if (bal === 0n) throw new Error('Deployer has no testnet BTC. Claim it at https://faucet.test.mezo.org/');

const out = { chainId: 31611, deployer: account.address, rpc: args.fork ? 'fork' : rpc };
for (const name of ['StatementRegistry', 'MusdPay']) {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.deployContract({ abi, bytecode });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`${name} deployment reverted: ${hash}`);
  out[name] = { address: rc.contractAddress, block: Number(rc.blockNumber), tx: hash, gasUsed: Number(rc.gasUsed) };
  console.log(`${name}: ${rc.contractAddress}  block ${rc.blockNumber}  gas ${rc.gasUsed}  tx ${hash}`);
}

const file = path.resolve(root, args.fork ? 'deployments.fork.json' : 'deployments.json');
writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', path.basename(file));

if (!args.fork) {
  const cfgPath = path.resolve(root, 'docs', 'config.js');
  let cfg = readFileSync(cfgPath, 'utf8');
  cfg = cfg.replace(/31611: \{[^}]*\},/, `31611: { registry: '${out.StatementRegistry.address}', registryDeployBlock: ${out.StatementRegistry.block}, pay: '${out.MusdPay.address}' },`);
  writeFileSync(cfgPath, cfg);
  console.log('updated docs/config.js');
}

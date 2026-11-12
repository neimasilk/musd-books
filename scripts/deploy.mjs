// Deploys StatementRegistry and MusdPay to Mezo.
// Usage: node scripts/deploy.mjs [--rpc <url>] [--fork] [--mainnet]
//   --fork     deploys to a local fork (anvil) and writes deployments.fork.json; does not touch docs/config.js
//   --mainnet  deploys to Mezo mainnet (chain 31612), writes deployments.mainnet.json and the 31612 entry of docs/config.js
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadEnv, parseArgs, clientsFor, artifact, root, TESTNET_RPC, MAINNET_RPC } from './lib.mjs';

const args = parseArgs();
const chainId = args.mainnet ? 31612 : 31611;
const rpc = args.rpc || (args.mainnet ? MAINNET_RPC : TESTNET_RPC);
const env = loadEnv();
if (!env.MEZO_TESTNET_KEY) throw new Error('MEZO_TESTNET_KEY missing from .env');
const { pub, wallet, account } = clientsFor(rpc, env.MEZO_TESTNET_KEY, chainId);

const bal = await pub.getBalance({ address: account.address });
console.log(`deployer ${account.address}  balance ${Number(bal) / 1e18} BTC (gas token)`);
if (bal === 0n) throw new Error(args.mainnet ? 'Deployer has no mainnet BTC for gas.' : 'Deployer has no testnet BTC. Claim it at https://faucet.test.mezo.org/');
if ((await pub.getChainId()) !== chainId) throw new Error(`RPC chain id is not ${chainId}`);

const out = { chainId, deployer: account.address, rpc: args.fork ? 'fork' : rpc };
for (const name of ['StatementRegistry', 'MusdPay']) {
  const { abi, bytecode } = artifact(name);
  const hash = await wallet.deployContract({ abi, bytecode });
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`${name} deployment reverted: ${hash}`);
  out[name] = { address: rc.contractAddress, block: Number(rc.blockNumber), tx: hash, gasUsed: Number(rc.gasUsed) };
  console.log(`${name}: ${rc.contractAddress}  block ${rc.blockNumber}  gas ${rc.gasUsed}  tx ${hash}`);
}

const file = path.resolve(root, args.fork ? 'deployments.fork.json' : args.mainnet ? 'deployments.mainnet.json' : 'deployments.json');
writeFileSync(file, JSON.stringify(out, null, 2) + '\n');
console.log('wrote', path.basename(file));

if (!args.fork) {
  const cfgPath = path.resolve(root, 'docs', 'config.js');
  let cfg = readFileSync(cfgPath, 'utf8');
  if (args.mainnet) {
    cfg = cfg.replace(/31612: \{[^}]*\},/, `31612: { registry: '${out.StatementRegistry.address}', registryDeployBlock: ${out.StatementRegistry.block}, pay: '${out.MusdPay.address}' },`);
  } else {
    cfg = cfg.replace(/31611: \{[^}]*\},/, `31611: { registry: '${out.StatementRegistry.address}', registryDeployBlock: ${out.StatementRegistry.block}, pay: '${out.MusdPay.address}' },`);
  }
  writeFileSync(cfgPath, cfg);
  console.log('updated docs/config.js');
}

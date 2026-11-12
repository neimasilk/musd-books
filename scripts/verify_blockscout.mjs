// Verifies a deployed contract on a Mezo Blockscout explorer from its single-file source (the contracts have no imports).
// Usage: node scripts/verify_blockscout.mjs <ContractName> <address> [--mainnet]
// Compiler settings are read from the Foundry artifact metadata, so they match the deployed bytecode.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs, root } from './lib.mjs';

const args = parseArgs();
const [name, address] = args._;
if (!name || !address) throw new Error('usage: verify_blockscout.mjs <ContractName> <address> [--mainnet]');
const api = args.mainnet ? 'https://api.explorer.mezo.org' : 'https://api.explorer.test.mezo.org';

const art = JSON.parse(readFileSync(path.resolve(root, 'contracts', 'out', `${name}.sol`, `${name}.json`), 'utf8'));
const meta = typeof art.rawMetadata === 'string' ? JSON.parse(art.rawMetadata) : art.metadata;
const srcPath = Object.keys(meta.sources)[0];
const source = readFileSync(path.resolve(root, 'contracts', srcPath), 'utf8');

const body = {
  compiler_version: 'v' + meta.compiler.version,
  source_code: source,
  is_optimization_enabled: !!meta.settings.optimizer?.enabled,
  optimization_runs: meta.settings.optimizer?.runs ?? 200,
  contract_name: name,
  evm_version: meta.settings.evmVersion || 'default',
  autodetect_constructor_args: true,
  license_type: 'mit',
};
const r = await fetch(`${api}/api/v2/smart-contracts/${address}/verification/via/flattened-code`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
console.log(r.status, (await r.text()).slice(0, 400));

// Poll the verification status.
for (let i = 0; i < 20; i++) {
  await new Promise((res) => setTimeout(res, 6000));
  const s = await (await fetch(`${api}/api/v2/smart-contracts/${address}`)).json().catch(() => ({}));
  if (s.is_verified || s.is_fully_verified) { console.log('verified:', s.name, s.compiler_version); process.exit(0); }
}
console.log('not verified yet; check the explorer page');

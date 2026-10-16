// Shared helpers for the deploy and demo scripts. Keys come from D:\cariuang\.env and are never printed.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { createPublicClient, createWalletClient, defineChain, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const here = path.dirname(fileURLToPath(import.meta.url));
export const root = path.resolve(here, '..');

export function loadEnv(file = path.resolve(root, '..', '.env')) {
  const out = {};
  if (!existsSync(file)) return out;
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (m) out[m[1]] = m[2].trim().replace(/^["']|["']$/g, '');
  }
  return out;
}

export function parseArgs(argv = process.argv.slice(2)) {
  const a = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const k = argv[i].slice(2);
      if (argv[i + 1] && !argv[i + 1].startsWith('--')) a[k] = argv[++i]; else a[k] = true;
    } else a._.push(argv[i]);
  }
  return a;
}

export const TESTNET_RPC = 'https://rpc.test.mezo.org';

export function makeChain(rpcUrl, id = 31611) {
  return defineChain({
    id,
    name: 'Mezo Testnet',
    nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
  });
}

export function clientsFor(rpcUrl, privateKey) {
  const chain = makeChain(rpcUrl);
  const account = privateKeyToAccount(privateKey.startsWith('0x') ? privateKey : '0x' + privateKey);
  return {
    chain, account,
    pub: createPublicClient({ chain, transport: http(rpcUrl) }),
    wallet: createWalletClient({ account, chain, transport: http(rpcUrl) }),
  };
}

export function artifact(name) {
  const p = path.resolve(root, 'contracts', 'out', `${name}.sol`, `${name}.json`);
  const j = JSON.parse(readFileSync(p, 'utf8'));
  return { abi: j.abi, bytecode: j.bytecode.object };
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

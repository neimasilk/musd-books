// Real Stability Pool deposit on Mezo Testnet, then a live read of the position with the app's own engine.
// Usage: node scripts/pool_demo.mjs [--amount 100] [--rpc <url>]
// Keys come from D:\cariuang\.env (MEZO_TESTNET_KEY) and are never printed. Testnet only; no real money.
import { parseUnits, formatUnits } from 'viem';
import { loadEnv, parseArgs, clientsFor, TESTNET_RPC, sleep } from './lib.mjs';
import { createRpc, getStabilityPoolPosition, MEZO_TESTNET } from '../docs/engine.js';

const args = parseArgs();
const rpcUrl = args.rpc || TESTNET_RPC;
const amount = parseUnits(String(args.amount || 100), 18);
const env = loadEnv();
if (!env.MEZO_TESTNET_KEY) throw new Error('MEZO_TESTNET_KEY missing from .env');

const { pub, wallet, account } = clientsFor(rpcUrl, env.MEZO_TESTNET_KEY);
const rpc = createRpc(rpcUrl);
const POOL = MEZO_TESTNET.stabilityPool;
const MUSD = MEZO_TESTNET.tokens.MUSD.address;
const poolAbi = [{ type: 'function', name: 'provideToSP', stateMutability: 'nonpayable', inputs: [{ name: '_amount', type: 'uint256' }], outputs: [] }];
const erc20 = [
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ type: 'address' }, { type: 'address' }], outputs: [{ type: 'uint256' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [{ type: 'bool' }] },
];
const fmt = (v) => formatUnits(v, 18);

const balance = await pub.readContract({ address: MUSD, abi: erc20, functionName: 'balanceOf', args: [account.address] });
console.log('account', account.address, '| MUSD balance', fmt(balance));
if (balance < amount) throw new Error(`need ${fmt(amount)} MUSD, have ${fmt(balance)}`);

const before = await getStabilityPoolPosition(rpc, MEZO_TESTNET, account.address);
console.log('position before:', before ? `${fmt(before.deposit)} MUSD` : 'none');

// The public RPC can return a gas estimate below the EIP-7623 floor and is slow to index receipts, so pad gas and poll patiently.
async function send(label, p) {
  const est = await pub.estimateContractGas({ account, ...p });
  const hash = await wallet.writeContract({ ...p, gas: est + 200_000n });
  let rc;
  for (let i = 0; i < 45 && !rc; i++) {
    try { rc = await pub.waitForTransactionReceipt({ hash, timeout: 20_000, retryCount: 8 }); } catch { await sleep(2000); }
  }
  if (!rc || rc.status !== 'success') throw new Error(`${label} failed: ${hash}`);
  console.log(`${label}  block ${rc.blockNumber}  tx ${hash}`);
  return rc;
}

// The pool pulls MUSD with transferFrom (OpenZeppelin ERC-20), so it needs an allowance first.
const allowance = await pub.readContract({ address: MUSD, abi: erc20, functionName: 'allowance', args: [account.address, POOL] });
if (allowance < amount) await send(`approve ${fmt(amount)} MUSD to the pool`, { address: MUSD, abi: erc20, functionName: 'approve', args: [POOL, amount] });
const rc = await send(`provideToSP ${fmt(amount)} MUSD`, { address: POOL, abi: poolAbi, functionName: 'provideToSP', args: [amount] });

const after = await getStabilityPoolPosition(rpc, MEZO_TESTNET, account.address);
console.log('position after: deposit', fmt(after.deposit), 'MUSD | share', after.sharePct.toFixed(6) + '%', '| pool total', fmt(after.totalDeposits), '| BTC gain', fmt(after.collateralGain));
const grew = after.deposit - (before ? before.deposit : 0n);
console.log(grew === amount ? 'OK: the deposit grew by exactly the amount sent' : `NOTE: deposit grew by ${fmt(grew)} (the compounded balance can differ after liquidations)`);

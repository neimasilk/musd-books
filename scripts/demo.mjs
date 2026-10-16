// Runs a realistic end-to-end demo on Mezo: a Trove owner borrows MUSD, pays a merchant with invoice
// references through MusdPay (permit and approve paths), the merchant pays a supplier, the owner repays part
// of the loan, then both parties build, anchor and re-verify their statements.
// Usage: node scripts/demo.mjs [--rpc <url>] [--fork]
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseUnits, formatUnits, keccak256, toBytes, erc20Abi, createWalletClient, http } from 'viem';
import { loadEnv, parseArgs, clientsFor, root, TESTNET_RPC, sleep } from './lib.mjs';
import { createRpc, buildStatement, MEZO_TESTNET, parseCsvHeader } from '../docs/engine.js';

const args = parseArgs();
const rpcUrl = args.rpc || TESTNET_RPC;
const env = loadEnv();
const dep = JSON.parse(readFileSync(path.resolve(root, args.fork ? 'deployments.fork.json' : 'deployments.json'), 'utf8'));
const REGISTRY = dep.StatementRegistry.address, PAY = dep.MusdPay.address;

const BORROWER_OPS = '0xCdF7028ceAB81fA0C6971208e83fa7872994beE5';
const PRICE_FEED = '0x86bCF0841622a5dAC14A313a15f96A95421b9366';
const MUSD = MEZO_TESTNET.tokens.MUSD.address;
const ZERO = '0x0000000000000000000000000000000000000000';

const bo = JSON.parse(readFileSync(path.resolve(root, 'scripts/abi/BorrowerOperations.min.json'), 'utf8'));
const feedAbi = [{ type: 'function', name: 'fetchPrice', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] }];
const permitAbi = [
  { type: 'function', name: 'eip712Domain', stateMutability: 'view', inputs: [], outputs: [{ type: 'bytes1' }, { type: 'string' }, { type: 'string' }, { type: 'uint256' }, { type: 'address' }, { type: 'bytes32' }, { type: 'uint256[]' }] },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ type: 'address' }], outputs: [{ type: 'uint256' }] },
];
const payAbi = JSON.parse(readFileSync(path.resolve(root, 'contracts/out/MusdPay.sol/MusdPay.json'), 'utf8')).abi;
const regAbi = JSON.parse(readFileSync(path.resolve(root, 'contracts/out/StatementRegistry.sol/StatementRegistry.json'), 'utf8')).abi;

const owner = clientsFor(rpcUrl, env.MEZO_TESTNET_KEY);
const store = clientsFor(rpcUrl, env.MEZO_DEMO_MERCHANT_KEY);
const pub = owner.pub;
const M = (n) => parseUnits(String(n), 18);
const fmt = (v) => formatUnits(v, 18);

async function send(who, label, p) {
  const hash = await who.wallet.writeContract(p);
  const rc = await pub.waitForTransactionReceipt({ hash });
  if (rc.status !== 'success') throw new Error(`${label} reverted: ${hash}`);
  console.log(`  ${label.padEnd(34)} block ${rc.blockNumber}  gas ${rc.gasUsed}  ${hash.slice(0, 18)}…`);
  return rc;
}

const musdMintBurnAbi = [
  { type: 'function', name: 'mint', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'burn', stateMutability: 'nonpayable', inputs: [{ type: 'address' }, { type: 'uint256' }], outputs: [] },
];
// The Mezo price oracle is a chain precompile that a local fork does not have, so openTrove and repayMUSD cannot
// run on a fork. In --fork mode only, BorrowerOperations (which holds the mint and burn roles) is impersonated to
// produce the same MUSD mint and burn logs. The real run on testnet uses the real openTrove and repayMUSD.
async function forkAsBorrowerOps(fn, a) {
  await pub.request({ method: 'anvil_impersonateAccount', params: [BORROWER_OPS] });
  await pub.request({ method: 'anvil_setBalance', params: [BORROWER_OPS, '0xde0b6b3a7640000'] });
  const w = createWalletClient({ account: BORROWER_OPS, chain: owner.chain, transport: http(rpcUrl) });
  const hash = await w.writeContract({ address: MUSD, abi: musdMintBurnAbi, functionName: fn, args: a });
  const rc = await pub.waitForTransactionReceipt({ hash });
  console.log(`  [fork] ${fn} via impersonated BorrowerOperations   block ${rc.blockNumber}`);
  return rc;
}

async function payWithPermit(who, merchant, amount, ref) {
  const [, name, version, chainId, verifyingContract] = await pub.readContract({ address: MUSD, abi: permitAbi, functionName: 'eip712Domain' });
  const nonce = await pub.readContract({ address: MUSD, abi: permitAbi, functionName: 'nonces', args: [who.account.address] });
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const sig = await who.wallet.signTypedData({
    domain: { name, version, chainId: Number(chainId), verifyingContract },
    types: { Permit: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' }, { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' }] },
    primaryType: 'Permit',
    message: { owner: who.account.address, spender: PAY, value: amount, nonce, deadline },
  });
  const r = '0x' + sig.slice(2, 66), s = '0x' + sig.slice(66, 130);
  let v = parseInt(sig.slice(130, 132), 16); if (v < 27) v += 27;
  return send(who, `payWithPermit ${fmt(amount)} "${ref}"`, { address: PAY, abi: payAbi, functionName: 'payWithPermit', args: [MUSD, merchant, amount, ref, deadline, v, r, s] });
}

async function payWithApprove(who, merchant, amount, ref) {
  await send(who, `approve ${fmt(amount)}`, { address: MUSD, abi: erc20Abi, functionName: 'approve', args: [PAY, amount] });
  return send(who, `pay ${fmt(amount)} "${ref}"`, { address: PAY, abi: payAbi, functionName: 'pay', args: [MUSD, merchant, amount, ref] });
}

console.log(`owner ${owner.account.address}\nstore ${store.account.address}\nregistry ${REGISTRY}\nMusdPay ${PAY}`);
let ownerBtc = await pub.getBalance({ address: owner.account.address });
console.log(`owner BTC ${fmt(ownerBtc)}`);
const startBlock = Number(await pub.getBlockNumber());

// 1. Borrow MUSD against test BTC (a Trove), unless the owner already holds enough MUSD.
let musdBal = await pub.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [owner.account.address] });
if (musdBal < M(500) && args.fork) {
  await forkAsBorrowerOps('mint', [owner.account.address, M(1800)]);
} else if (musdBal < M(500)) {
  const price = await pub.readContract({ address: PRICE_FEED, abi: feedAbi, functionName: 'fetchPrice' });
  const debt = M(1800);
  const fee = await pub.readContract({ address: BORROWER_OPS, abi: bo, functionName: 'getBorrowingFee', args: [debt] });
  const totalDebt = debt + fee + M(200); // + gas compensation
  const gasReserve = parseUnits('0.004', 18); // keep BTC for gas and for funding the store
  const collFor = (pct) => (totalDebt * BigInt(pct) * 10n ** 18n) / (100n * price);
  const pct = [150, 135, 125, 120].find((p) => collFor(p) + gasReserve <= ownerBtc);
  if (!pct) throw new Error(`Need about ${fmt(collFor(120) + gasReserve)} BTC for a Trove (price ${fmt(price)} USD/BTC); have ${fmt(ownerBtc)}.`);
  console.log(`opening a Trove: borrow ${fmt(debt)} MUSD (fee ${fmt(fee)}), collateral ${fmt(collFor(pct))} BTC at ${pct}% collateral ratio`);
  await send(owner, 'openTrove', { address: BORROWER_OPS, abi: bo, functionName: 'openTrove', args: [debt, ZERO, ZERO], value: collFor(pct) });
}
musdBal = await pub.readContract({ address: MUSD, abi: erc20Abi, functionName: 'balanceOf', args: [owner.account.address] });
console.log(`owner MUSD ${fmt(musdBal)}`);

// 2. Give the demo store a little BTC for gas.
if ((await pub.getBalance({ address: store.account.address })) < parseUnits('0.0004', 18)) {
  const h = await owner.wallet.sendTransaction({ to: store.account.address, value: parseUnits('0.0008', 18) });
  await pub.waitForTransactionReceipt({ hash: h });
  console.log('  funded the store with 0.0008 BTC for gas');
}

// 3. Customer payments to the store with invoice references.
const firstPaymentBlock = Number(await pub.getBlockNumber()) + 1;
await payWithPermit(owner, store.account.address, M(25), 'INV-2026-0001');
await payWithApprove(owner, store.account.address, M(40), 'INV-2026-0002');
await payWithPermit(owner, store.account.address, parseUnits('12.5', 18), 'INV-2026-0003');
await send(owner, 'plain transfer 5 (no reference)', { address: MUSD, abi: erc20Abi, functionName: 'transfer', args: [store.account.address, M(5)] });
// 4. The store pays a supplier.
await payWithApprove(store, owner.account.address, M(10), 'PO-2026-0007');
// 5. The owner repays part of the loan (burns MUSD).
const lastRc = args.fork
  ? await forkAsBorrowerOps('burn', [owner.account.address, M(100)])
  : await send(owner, 'repayMUSD 100', { address: BORROWER_OPS, abi: bo, functionName: 'repayMUSD', args: [M(100), ZERO, ZERO] });
const endBlock = Number(lastRc.blockNumber);

// 6. Wait until the range is safely in the past, then build both statements.
if (args.fork) await pub.request({ method: 'anvil_mine', params: ['0x3'] }); // anvil mines only on demand
while (Number(await pub.getBlockNumber()) <= endBlock + 1) await sleep(1500);
const rpc = createRpc(rpcUrl);
MEZO_TESTNET.payAddress = PAY;
const build = (acct, from) => buildStatement(rpc, MEZO_TESTNET, MUSD, acct, from, endBlock);
const storeSt = await build(store.account.address, firstPaymentBlock);
const ownerSt = await build(owner.account.address, startBlock);
for (const [name, st] of [['store', storeSt], ['owner', ownerSt]]) {
  const s = st.summary;
  const kinds = {}; for (const r of st.rows) kinds[r.kind] = (kinds[r.kind] || 0) + 1;
  console.log(`${name}: ${s.count} rows ${JSON.stringify(kinds)} opening ${fmt(s.opening)} in ${fmt(s.totalIn)} out ${fmt(s.totalOut)} closing ${fmt(s.closing)} unexplained ${fmt(s.unexplained)} minted ${fmt(s.minted)} burned ${fmt(s.burned)}`);
  if (s.unexplained !== 0n) throw new Error(`${name} statement does not reconcile`);
}
const refs = storeSt.rows.map((r) => `${r.direction}:${r.reference || '-'}`).join(' ');
console.log('store references:', refs);

// 7. Anchor: the store anchors its statement, the owner co-signs it, and anchors their own borrower statement.
const storeHash = keccak256(toBytes(storeSt.csv)), ownerHash = keccak256(toBytes(ownerSt.csv));
const anchor = (who, label, st, hash) => send(who, `anchor ${label}`, {
  address: REGISTRY, abi: regAbi, functionName: 'anchor',
  args: [hash, st.summary.account, MUSD, BigInt(st.summary.fromBlock), BigInt(st.summary.toBlock), label],
});
await anchor(store, 'Demo Store Oct 2026', storeSt, storeHash);
await anchor(owner, 'Accountant co-sign', storeSt, storeHash);
await anchor(owner, 'Trove owner Oct 2026', ownerSt, ownerHash);

// 8. Verify: anchors are readable and a fresh re-derivation is byte-identical.
const anchors = await pub.readContract({ address: REGISTRY, abi: regAbi, functionName: 'getAnchors', args: [storeHash] });
const again = await build(store.account.address, firstPaymentBlock);
console.log(`store hash ${storeHash}\n  anchors: ${anchors.length}  re-derived identical: ${again.csv === storeSt.csv}`);
if (anchors.length !== 2 || again.csv !== storeSt.csv) throw new Error('verification failed');

// 9. Save demo files and register the demo in docs/config.js.
writeFileSync(path.resolve(root, 'docs', 'demo-store-statement.csv'), storeSt.csv);
writeFileSync(path.resolve(root, 'docs', 'demo-borrower-statement.csv'), ownerSt.csv);
const result = { rpc: args.fork ? 'fork' : rpcUrl, store: { account: store.account.address, from: firstPaymentBlock, to: endBlock, hash: storeHash }, owner: { account: owner.account.address, from: startBlock, to: endBlock, hash: ownerHash } };
writeFileSync(path.resolve(root, args.fork ? 'demo-result.fork.json' : 'demo-result.json'), JSON.stringify(result, null, 2) + '\n');
if (!args.fork) {
  const p = path.resolve(root, 'docs', 'config.js');
  let cfg = readFileSync(p, 'utf8');
  cfg = cfg.replace(/(31611: \{[^}]*?)( \},)/, `$1, demo: { account: '${store.account.address}', from: ${firstPaymentBlock}, to: ${endBlock} }$2`);
  writeFileSync(p, cfg);
  console.log('registered demo in docs/config.js');
}
console.log('done');

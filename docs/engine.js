// MUSD Books core: builds deterministic ERC-20 account statements (MUSD by default) on Mezo.
// Runs in the browser and in Node (pass any EIP-1193-like `rpc(method, params)` function).
// No dependencies: hashing is done by the caller (the app uses viem's keccak256).

export const STATEMENT_VERSION = 'musdbooks-statement-v1';

// Core Mezo contracts name counterparties in a statement (addresses from mezo-org/musd deployments).
// Frozen with the statement version: changing this table changes statement bytes, so it needs a new
// version string.
const CORE_TESTNET = {
  '0x143a063f62340da3a8bea1c5642d18c6d0f7ff51': 'Mezo ActivePool',
  '0xcdf7028ceab81fa0c6971208e83fa7872994bee5': 'Mezo BorrowerOperations',
  '0xb4c35747c26e4ab5f1a7cdc7e875b5946efa6fa9': 'Mezo CollSurplusPool',
  '0x59851d252090283f9367c159f0c9036e75483300': 'Mezo DefaultPool',
  '0x8fa3ef45137c3aff337e42f98023c1d7dd3666c0': 'Mezo GasPool',
  '0x4e4cba3779d56386ed43631b4dcd6d8eacecbcf6': 'Mezo HintHelpers',
  '0xd4d6c36a592a2c5e86035a6bca1d57747a567f37': 'Mezo InterestRateManager',
  '0x4ddd70f4c603b6089c07875be02fedfd626b80af': 'Mezo PCV',
  '0x1cca7e410ee41739792ea0a24e00349dd247680e': 'Mezo StabilityPool',
  '0xe47c80e8c23f6b4a1ae41c34837a0599d5d16bb0': 'Mezo TroveManager',
};
const CORE_MAINNET = {
  '0x3012c2fe1240e3754e5c200a0946bb0e07474876': 'Mezo ActivePool',
  '0x44b1bac67dda612a41a58aaf779143b181dee031': 'Mezo BorrowerOperations',
  '0xbf51807acb3394b8550f0554fb9098856ef5f491': 'Mezo CollSurplusPool',
  '0xe4b5913c0c82db2efc553b95c0173efb90a07c8b': 'Mezo DefaultPool',
  '0x3eb418bdbe95b4b9cf465ecfbd8424685acd1bc1': 'Mezo GasPool',
  '0xd267b3be2514375a075fd03c3d9cba6b95317dc3': 'Mezo HintHelpers',
  '0x4a453700d157717fe02fb62e7700ed7845048285': 'Mezo InterestRateManager',
  '0x391ecc7ffefc48cff41d0f2bb36e38b82180b993': 'Mezo PCV',
  '0x73245eff485ab3aac1158b3c4d8f4b23797b0e32': 'Mezo StabilityPool',
  '0x94afb503dbca74ac3e4929baceedfce19b93c193': 'Mezo TroveManager',
};

export const MEZO_TESTNET = {
  id: 31611,
  name: 'Mezo Testnet',
  rpcUrl: 'https://rpc.test.mezo.org',
  explorer: 'https://explorer.test.mezo.org',
  tokens: {
    MUSD: { address: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503', symbol: 'MUSD', decimals: 18 },
  },
  core: CORE_TESTNET,
  troveManager: '0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0',
  priceFeed: '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
  // Filled in by the app config after deployment.
  payAddress: null,
};

export const MEZO_MAINNET = {
  id: 31612,
  name: 'Mezo',
  rpcUrl: 'https://mezo-mainnet.boar.network',
  fallbackRpcUrls: ['https://mainnet.mezo.public.validationcloud.io'],
  explorer: 'https://explorer.mezo.org',
  tokens: {
    MUSD: { address: '0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186', symbol: 'MUSD', decimals: 18 },
  },
  core: CORE_MAINNET,
  troveManager: '0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193',
  priceFeed: '0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88',
  payAddress: null,
};

export const NETWORKS = { [MEZO_TESTNET.id]: MEZO_TESTNET, [MEZO_MAINNET.id]: MEZO_MAINNET };

export const TRANSFER_TOPIC = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
// keccak256("PaymentReference(address,address,address,uint256,bytes32,string)")
export const PAYMENT_REF_TOPIC = '0x0a8c2b7e10eeb41773d43a678fe379271a4769bf715d39e489b22a33d339ecb5';

export const MAX_RANGE = 9999; // RPC limit: 10,000 blocks per eth_getLogs on Mezo
const ZERO = '0x0000000000000000000000000000000000000000';

export function createRpc(url, fetchImpl = fetch) {
  let id = 0;
  return async function rpc(method, params, attempt = 0) {
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    });
    if (res.status === 429 || res.status >= 500) {
      if (attempt < 5) {
        await new Promise((r) => setTimeout(r, 400 * 2 ** attempt));
        return rpc(method, params, attempt + 1);
      }
      throw new Error(`RPC HTTP ${res.status}`);
    }
    const body = await res.json();
    if (body.error) {
      const err = new Error(body.error.message || 'RPC error');
      err.rpc = body.error;
      throw err;
    }
    return body.result;
  };
}

const hex = (n) => '0x' + BigInt(n).toString(16);
const topicAddr = (a) => '0x' + a.toLowerCase().replace(/^0x/, '').padStart(64, '0');
const addrFromTopic = (t) => '0x' + t.slice(-40).toLowerCase();

export function isAddress(a) {
  return typeof a === 'string' && /^0x[0-9a-fA-F]{40}$/.test(a);
}

/** Format an integer token amount with `decimals` as an exact decimal string. */
export function formatUnits(value, decimals = 18) {
  const neg = value < 0n;
  const v = neg ? -value : value;
  const base = 10n ** BigInt(decimals);
  const whole = v / base;
  const frac = (v % base).toString().padStart(decimals, '0').replace(/0+$/, '');
  return (neg ? '-' : '') + whole.toString() + (frac ? '.' + frac : '');
}

/** Run async tasks with bounded concurrency, preserving order. */
export async function pool(items, limit, fn, onProgress) {
  const out = new Array(items.length);
  let next = 0, done = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
      done++;
      onProgress && onProgress(done, items.length);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

/** eth_getLogs over [from,to] that splits on range/result-size limits. */
export async function getLogsSplit(rpc, filter, from, to) {
  try {
    return await rpc('eth_getLogs', [{ ...filter, fromBlock: hex(from), toBlock: hex(to) }]);
  } catch (e) {
    const msg = (e.message || '').toLowerCase();
    const limited = ['max results', 'range', 'too large', 'limit', 'distance', 'too many', 'exceed', 'more than'];
    if (to > from && limited.some((k) => msg.includes(k))) {
      const mid = from + Math.floor((to - from) / 2);
      const [a, b] = await Promise.all([getLogsSplit(rpc, filter, from, mid), getLogsSplit(rpc, filter, mid + 1, to)]);
      return a.concat(b);
    }
    throw e;
  }
}

export function chunkRange(from, to, size = MAX_RANGE) {
  const chunks = [];
  for (let s = from; s <= to; s += size) chunks.push([s, Math.min(s + size - 1, to)]);
  return chunks;
}

// ---- ABI decoding for PaymentReference data: (uint256 amount, bytes32 refHash, string ref)
export function decodePaymentRefData(data) {
  const d = data.replace(/^0x/, '');
  const word = (i) => d.slice(i * 64, i * 64 + 64);
  const amount = BigInt('0x' + word(0));
  const refHash = '0x' + word(1);
  const offset = Number(BigInt('0x' + word(2))) / 32;
  const len = Number(BigInt('0x' + word(offset)));
  const bytesHex = d.slice((offset + 1) * 64, (offset + 1) * 64 + len * 2);
  return { amount, refHash, ref: hexToText(bytesHex) };
}

function hexToText(h) {
  if (!h) return '';
  const bytes = new Uint8Array(h.match(/../g).map((b) => parseInt(b, 16)));
  try {
    const s = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    if (/^[\x20-\x7E -￿]*$/.test(s)) return s;
  } catch (_) { /* not utf-8 */ }
  return '0x' + h;
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
};

/** Read symbol/decimals from the token contract itself. */
export async function getTokenInfo(rpc, token) {
  const call = (data) => rpc('eth_call', [{ to: token, data }, 'latest']);
  const [dec, sym] = await Promise.all([call('0x313ce567'), call('0x95d89b41')]);
  const decimals = Number(BigInt(dec));
  let symbol = '';
  try {
    const s = sym.replace(/^0x/, '');
    if (s.length === 64) symbol = hexToText(s.replace(/(00)+$/, ''));
    else { const len = Number(BigInt('0x' + s.slice(64, 128))); symbol = hexToText(s.slice(128, 128 + len * 2)); }
  } catch (_) { symbol = ''; }
  return { decimals, symbol };
}

async function balanceOf(rpc, token, account, block) {
  const data = '0x70a08231' + account.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const r = await rpc('eth_call', [{ to: token, data }, hex(block)]);
  return BigInt(r);
}

/**
 * Build a statement for `account` and `token` over blocks [fromBlock, toBlock].
 * Returns rows + canonical CSV (deterministic: same chain data => same bytes).
 * `net.payAddress`, when set, is the MusdPay contract whose PaymentReference logs
 * attach an invoice reference to each payment.
 */
export async function buildStatement(rpc, net, token, account, fromBlock, toBlock, { concurrency = 4, onProgress, info, payAddress } = {}) {
  if (!isAddress(account)) throw new Error('Invalid address');
  if (!isAddress(token)) throw new Error('Invalid token');
  account = account.toLowerCase();
  token = token.toLowerCase();
  fromBlock = Number(fromBlock); toBlock = Number(toBlock);
  if (!(fromBlock >= 1) || !(toBlock >= fromBlock)) throw new Error('Invalid block range');

  info = info || (await getTokenInfo(rpc, token));
  const names = { ...(net.core || {}) };
  const payRaw = payAddress !== undefined ? payAddress : net.payAddress;
  const pay = payRaw && isAddress(payRaw) ? payRaw.toLowerCase() : null;

  const tasks = [];
  for (const [a, b] of chunkRange(fromBlock, toBlock)) {
    tasks.push({ kind: 'out', a, b, filter: { address: token, topics: [TRANSFER_TOPIC, topicAddr(account)] } });
    tasks.push({ kind: 'in', a, b, filter: { address: token, topics: [TRANSFER_TOPIC, null, topicAddr(account)] } });
    if (pay) {
      tasks.push({ kind: 'ref', a, b, filter: { address: pay, topics: [PAYMENT_REF_TOPIC, topicAddr(token), topicAddr(account)] } });
      tasks.push({ kind: 'ref', a, b, filter: { address: pay, topics: [PAYMENT_REF_TOPIC, topicAddr(token), null, topicAddr(account)] } });
    }
  }

  const [opening, closing] = await Promise.all([
    balanceOf(rpc, token, account, fromBlock - 1),
    balanceOf(rpc, token, account, toBlock),
  ]);

  const results = await pool(tasks, concurrency, (t) => getLogsSplit(rpc, t.filter, t.a, t.b), onProgress);

  const transfers = [];
  const refs = new Map(); // `${tx}:${logIndex}` -> reference entry
  results.forEach((logs, i) => {
    const kind = tasks[i].kind;
    for (const log of logs) {
      const tx = log.transactionHash.toLowerCase();
      const logIndex = Number(BigInt(log.logIndex));
      if (kind === 'ref') {
        if (log.address.toLowerCase() !== pay || log.topics[0] !== PAYMENT_REF_TOPIC) continue;
        const { amount, refHash, ref } = decodePaymentRefData(log.data);
        refs.set(`${tx}:${logIndex}`, { payer: addrFromTopic(log.topics[2]), merchant: addrFromTopic(log.topics[3]), amount, refHash, ref });
      } else {
        // Only ERC-20 Transfer logs from the token itself (ERC-721 Transfer has 4 topics).
        if (log.address.toLowerCase() !== token || log.topics[0] !== TRANSFER_TOPIC || log.topics.length !== 3) continue;
        transfers.push({
          block: Number(BigInt(log.blockNumber)),
          txHash: tx,
          logIndex,
          direction: kind,
          from: addrFromTopic(log.topics[1]),
          to: addrFromTopic(log.topics[2]),
          counterparty: kind === 'in' ? addrFromTopic(log.topics[1]) : addrFromTopic(log.topics[2]),
          amount: BigInt(log.data),
        });
      }
    }
  });

  // de-duplicate (a split retry could overlap) and sort deterministically
  const seen = new Set();
  const rows = transfers
    .filter((t) => {
      const k = `${t.txHash}:${t.logIndex}:${t.direction}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    })
    .sort((x, y) => x.block - y.block || x.logIndex - y.logIndex || (x.direction < y.direction ? -1 : 1));

  for (const r of rows) {
    // MusdPay emits PaymentReference as the log right after the token's Transfer log.
    const ref = refs.get(`${r.txHash}:${r.logIndex + 1}`);
    const matches = ref && ref.payer === r.from && ref.merchant === r.to && ref.amount === r.amount;
    r.reference = matches ? ref.ref : '';
    r.refHash = matches ? ref.refHash : '';
    if (r.from === ZERO) r.kind = 'mint';
    else if (r.to === ZERO) r.kind = 'burn';
    else if (matches) r.kind = 'payment';
    else r.kind = 'transfer';
    r.counterpartyLabel = names[r.counterparty] || '';
  }

  const sum = (pred) => rows.filter(pred).reduce((s, r) => s + r.amount, 0n);
  const totalIn = sum((r) => r.direction === 'in');
  const totalOut = sum((r) => r.direction === 'out');
  const minted = sum((r) => r.direction === 'in' && r.kind === 'mint');
  const burned = sum((r) => r.direction === 'out' && r.kind === 'burn');
  // For a plain ERC-20 this is exactly zero. A non-zero value means the token moves balances
  // without Transfer logs (rebasing or fee-on-transfer), and the statement says so.
  const unexplained = closing - opening - totalIn + totalOut;

  let running = opening;
  for (const r of rows) {
    running += r.direction === 'in' ? r.amount : -r.amount;
    r.running = running;
  }

  const summary = {
    chainId: net.id, account, token, symbol: info.symbol, decimals: info.decimals, pay,
    fromBlock, toBlock, opening, closing, totalIn, totalOut, minted, burned, unexplained, count: rows.length,
  };
  return { summary, rows, csv: canonicalCsv(summary, rows) };
}

export function canonicalCsv(s, rows) {
  const f = (v) => formatUnits(v, s.decimals);
  const lines = [
    `# ${STATEMENT_VERSION}`,
    `# chain_id,${s.chainId}`,
    `# account,${s.account}`,
    `# token,${s.token}`,
    `# token_symbol,${s.symbol}`,
    `# token_decimals,${s.decimals}`,
    `# pay_contract,${s.pay || 'none'}`,
    `# from_block,${s.fromBlock}`,
    `# to_block,${s.toBlock}`,
    `# opening_balance,${f(s.opening)}`,
    `# closing_balance,${f(s.closing)}`,
    `# total_in,${f(s.totalIn)}`,
    `# total_out,${f(s.totalOut)}`,
    `# minted_in,${f(s.minted)}`,
    `# burned_out,${f(s.burned)}`,
    `# unexplained,${f(s.unexplained)}`,
    `# transfers,${s.count}`,
    'block,tx_hash,log_index,direction,kind,counterparty,counterparty_label,amount,reference',
  ];
  for (const r of rows) {
    lines.push([r.block, r.txHash, r.logIndex, r.direction, r.kind, r.counterparty, r.counterpartyLabel, f(r.amount), r.reference].map(csvCell).join(','));
  }
  return lines.join('\n') + '\n';
}

/** Parse the header of a canonical CSV (for the verification UI). */
export function parseCsvHeader(text) {
  const meta = {};
  for (const line of text.split('\n')) {
    if (!line.startsWith('# ')) break;
    const [k, ...rest] = line.slice(2).split(',');
    meta[k] = rest.join(',');
  }
  return meta;
}

const TROVE_STATUS = ['none', 'active', 'closed by owner', 'closed by liquidation', 'closed by redemption'];

/**
 * Live read of an account's Mezo Trove (the Bitcoin-backed MUSD loan), straight from TroveManager and the PriceFeed.
 * These are current values: they are shown next to a statement but are NOT part of the hashed statement.
 * Returns null when the network has no Trove contracts configured or the account never had a Trove.
 */
export async function getTroveSnapshot(rpc, net, account) {
  if (!net.troveManager || !net.priceFeed || !isAddress(account)) return null;
  const arg = account.toLowerCase().replace(/^0x/, '').padStart(64, '0');
  const call = (to, data) => rpc('eth_call', [{ to, data }, 'latest']);
  const words = (hexStr) => { const h = hexStr.replace(/^0x/, ''); return Array.from({ length: h.length / 64 }, (_, i) => BigInt('0x' + h.slice(i * 64, i * 64 + 64))); };
  const statusCode = Number(words(await call(net.troveManager, '0x21e37801' + arg))[0]);
  if (statusCode === 0) return null;
  const [coll, principal, interest, pCollateral, pPrincipal, pInterest] = words(await call(net.troveManager, '0xb91af97c' + arg));
  const rateBp = Number(words(await call(net.troveManager, '0x92b7659b' + arg))[0]);
  const snap = { status: TROVE_STATUS[statusCode] || String(statusCode), active: statusCode === 1, coll: coll + pCollateral, principal: principal + pPrincipal, interest: interest + pInterest, rateBp };
  snap.debt = snap.principal + snap.interest;
  if (snap.active) {
    try {
      const price = words(await call(net.priceFeed, '0x0fdb11cf'))[0];
      const icr = words(await call(net.troveManager, '0xd293c710' + arg + price.toString(16).padStart(64, '0')))[0];
      snap.price = price;      // USD per BTC, 18 decimals
      snap.icr = icr;          // collateral ratio, 1e18 = 100%
      snap.collUsd = (snap.coll * price) / 10n ** 18n;
    } catch (_) { /* oracle unavailable: leave price fields out */ }
  }
  return snap;
}

/** Find the first block with timestamp >= ts (binary search). */
export async function blockAtOrAfter(rpc, ts, latest) {
  let lo = 1, hi = latest;
  const tsOf = async (n) => Number(BigInt((await rpc('eth_getBlockByNumber', [hex(n), false])).timestamp));
  if (ts <= (await tsOf(lo))) return lo;
  if (ts > (await tsOf(hi))) return hi;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    if ((await tsOf(mid)) < ts) lo = mid + 1; else hi = mid;
  }
  return lo;
}

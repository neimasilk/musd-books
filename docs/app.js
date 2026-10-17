import {
  createPublicClient, createWalletClient, custom, http, defineChain,
  keccak256, toBytes, getAddress, parseUnits, erc20Abi,
} from 'https://cdn.jsdelivr.net/npm/viem@2.57.2/+esm';
import {
  MEZO_TESTNET, MEZO_MAINNET, NETWORKS, createRpc, buildStatement, formatUnits,
  isAddress, parseCsvHeader, blockAtOrAfter, getTokenInfo, getTroveSnapshot, buildLenderReport,
} from './engine.js';
import { DEPLOYMENTS, isLive, REGISTRY_ABI, PAY_ABI, PERMIT_ABI } from './config.js';

const mk = (n, name) => defineChain({
  id: n.id,
  name,
  nativeCurrency: { name: 'Bitcoin', symbol: 'BTC', decimals: 18 },
  rpcUrls: { default: { http: [n.rpcUrl] } },
  blockExplorers: { default: { name: 'Mezo Explorer', url: n.explorer } },
  testnet: n.id === MEZO_TESTNET.id,
});
const chains = { [MEZO_TESTNET.id]: mk(MEZO_TESTNET, 'Mezo Testnet'), [MEZO_MAINNET.id]: mk(MEZO_MAINNET, 'Mezo') };
const rpcs = {}, clients = {};
for (const id of Object.keys(NETWORKS)) {
  NETWORKS[id].payAddress = isLive(DEPLOYMENTS[id].pay) ? DEPLOYMENTS[id].pay : null;
  rpcs[id] = createRpc(NETWORKS[id].rpcUrl);
  clients[id] = createPublicClient({ chain: chains[id], transport: http(NETWORKS[id].rpcUrl) });
}
let net = MEZO_TESTNET; // network selected in the Statement tab
const rpcFor = (id) => rpcs[id] || rpcs[MEZO_TESTNET.id];
const dep = (id) => DEPLOYMENTS[id] || DEPLOYMENTS[MEZO_TESTNET.id];

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const short = (a) => (a ? a.slice(0, 6) + '…' + a.slice(-4) : '');
const txLink = (h, n = net) => `<a href="${n.explorer}/tx/${h}" target="_blank" rel="noreferrer" class="mono">${short(h)}</a>`;
const addrLink = (a, n = net) => `<a href="${n.explorer}/address/${a}" target="_blank" rel="noreferrer" class="mono">${short(a)}</a>`;
const fmt2 = (v, dec) => {
  const s = formatUnits(v, dec);
  const [w, f = ''] = s.split('.');
  const neg = w.startsWith('-');
  const ww = (neg ? w.slice(1) : w).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return (neg ? '-' : '') + ww + '.' + (f + '00').slice(0, 2) + (f.length > 2 ? '…' : '');
};
const notice = (kind, html) => `<div class="notice ${kind}">${html}</div>`;

// The public RPC can lag behind in indexing receipts, so keep polling instead of failing on the first miss.
async function waitReceipt(client, hash) {
  let last;
  for (let i = 0; i < 45; i++) {
    try { return await client.waitForTransactionReceipt({ hash, timeout: 20_000, retryCount: 8 }); } catch (e) { last = e; await new Promise((r) => setTimeout(r, 2000)); }
  }
  throw last;
}

// The public RPC's gas estimate can fall below the EIP-7623 calldata floor (the node then rejects the transaction),
// so estimate first and add a margin. If estimating fails, let the wallet do it.
async function writeWithGas(client, params) {
  let gas;
  try { gas = (await client.estimateContractGas(params)) + 150_000n; } catch (_) { /* fall back to the wallet's own estimate */ }
  return walletClient.writeContract(gas ? { ...params, gas } : params);
}

// ---------- tabs
function showTab(name) {
  document.querySelectorAll('nav button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  for (const t of ['statement', 'verify', 'request', 'about', 'pay']) $('tab-' + t).classList.toggle('hidden', t !== name);
}
document.querySelectorAll('nav button').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));
$('aboutRegistry').textContent = isLive(dep(MEZO_TESTNET.id).registry) ? `${dep(MEZO_TESTNET.id).registry} (Mezo Testnet)` : '(not yet deployed)';
$('aboutPay').textContent = isLive(dep(MEZO_TESTNET.id).pay) ? `${dep(MEZO_TESTNET.id).pay} (Mezo Testnet)` : '(not yet deployed)';

// ---------- wallet
let walletClient = null, walletAccount = null;
async function connect(chainId) {
  if (!window.ethereum) throw new Error('No browser wallet found. Install MetaMask or Rabby.');
  const chain = chains[chainId];
  walletClient = createWalletClient({ chain, transport: custom(window.ethereum) });
  [walletAccount] = await walletClient.requestAddresses();
  try {
    await walletClient.switchChain({ id: chain.id });
  } catch (e) {
    await walletClient.addChain({ chain });
    await walletClient.switchChain({ id: chain.id });
  }
  $('connectBtn').textContent = short(walletAccount);
  return walletAccount;
}
$('connectBtn').addEventListener('click', () => connect(net.id).catch((e) => alert(e.shortMessage || e.message)));

// ---------- statement
$('network').addEventListener('change', () => { net = NETWORKS[Number($('network').value)] || MEZO_TESTNET; refreshDemoLinks(); });
$('tokenSel').addEventListener('change', () => $('tokenRow').classList.toggle('hidden', $('tokenSel').value !== 'custom'));
$('preset').addEventListener('change', () => {
  $('datesRow').classList.toggle('hidden', $('preset').value !== 'dates');
  $('blocksRow').classList.toggle('hidden', $('preset').value !== 'blocks');
});

const selectedToken = () => ($('tokenSel').value === 'custom' ? $('tokenAddr').value.trim() : net.tokens.MUSD.address);

async function resolveRange() {
  const rpc = rpcFor(net.id);
  const latest = Number(BigInt(await rpc('eth_blockNumber', [])));
  const head = latest - 2;
  const p = $('preset').value;
  if (p === 'blocks') {
    const a = parseInt($('fromBlock').value, 10), b = parseInt($('toBlock').value, 10);
    if (!(a > 0 && b >= a && b <= head)) throw new Error(`Enter a valid block range (latest safe block is ${head}).`);
    return [a, b];
  }
  if (p === 'dates') {
    const f = Date.parse($('fromDate').value + 'Z') / 1000, t = Date.parse($('toDate').value + 'Z') / 1000;
    if (!(f > 0 && t > f)) throw new Error('Pick a valid UTC date range.');
    $('genStatus').textContent = 'Locating blocks for those dates…';
    const a = await blockAtOrAfter(rpc, f, head);
    const b = (await blockAtOrAfter(rpc, t, head)) - 1;
    if (b < a) throw new Error('No blocks in that range.');
    return [a, b];
  }
  const secs = { '1h': 3600, '24h': 86400, '7d': 604800 }[p];
  const now = Number(BigInt((await rpc('eth_getBlockByNumber', ['0x' + head.toString(16), false])).timestamp));
  $('genStatus').textContent = 'Locating start block…';
  const a = await blockAtOrAfter(rpc, now - secs, head);
  return [a, head];
}

let current = null;
let lastAnchors = [];
let expectedHash = null; // set when the page is opened from a "share for review" link

const HASH_RE = /^0x[0-9a-fA-F]{64}$/;

// The sender's link carries the statement hash. The reviewer's browser re-derives the statement
// from chain data on its own and compares: a match means both sides hold the same books.
function renderReview(st) {
  const box = $('reviewBanner');
  if (expectedHash) {
    box.innerHTML = expectedHash.toLowerCase() === st.hash.toLowerCase()
      ? notice('ok', '✔ Independent check passed: this statement, re-derived from chain data in your browser, has exactly the hash the sender shared. You can co-attest it below.')
      : notice('bad', `✘ Hash mismatch. The sender shared <span class="mono">${esc(expectedHash)}</span> but the chain data for this range gives <span class="mono">${esc(st.hash)}</span>. Do not co-attest; ask the sender which range and token they used.`);
    $('anchorBtn').textContent = 'Co-attest this statement';
    $('label').placeholder = 'e.g. Reviewed by Kantor Akuntan Maju';
  } else {
    box.innerHTML = '';
    $('anchorBtn').textContent = 'Anchor statement';
  }
  const s = st.summary;
  const q = new URLSearchParams({ account: s.account, from: s.fromBlock, to: s.toBlock, net: s.chainId === MEZO_MAINNET.id ? 'mainnet' : 'testnet', expect: st.hash });
  if ($('tokenSel').value === 'custom') q.set('token', s.token);
  const url = `${location.origin}${location.pathname}?${q.toString()}`;
  $('shareReview').innerHTML = `<h3 style="margin:14px 0 4px">Share for independent review</h3>
    <p class="muted">Send this link to your accountant or lender. Their browser re-derives the statement from chain data and checks it against your hash. If it matches, they can co-attest in one click.</p>
    <p class="mono"><a href="${esc(url)}">${esc(url)}</a></p>
    <div class="actions"><button class="btn secondary" id="copyReview">Copy review link</button></div>`;
  $('copyReview').onclick = () => navigator.clipboard.writeText(url);
}

async function generate() {
  const acct = $('acct').value.trim();
  const token = selectedToken();
  if (!isAddress(acct)) { $('genStatus').textContent = 'Enter a valid 0x address.'; return; }
  if (!isAddress(token)) { $('genStatus').textContent = 'Enter a valid token contract address.'; return; }
  $('genBtn').disabled = true;
  $('result').classList.add('hidden');
  try {
    const [from, to] = await resolveRange();
    const prog = $('genProgress');
    prog.classList.remove('hidden'); prog.value = 0;
    $('genStatus').textContent = `Scanning blocks ${from.toLocaleString()}–${to.toLocaleString()}…`;
    const t0 = performance.now();
    const st = await buildStatement(rpcFor(net.id), net, token, acct, from, to, {
      onProgress: (d, n) => { prog.max = n; prog.value = d; },
    });
    st.hash = keccak256(toBytes(st.csv));
    current = st;
    renderStatement(st);
    renderReview(st);
    $('genStatus').textContent = `Done in ${((performance.now() - t0) / 1000).toFixed(1)} s.`;
    const q = new URLSearchParams({ account: acct, from, to, net: net.id === MEZO_MAINNET.id ? 'mainnet' : 'testnet' });
    if ($('tokenSel').value === 'custom') q.set('token', token);
    if (expectedHash) q.set('expect', expectedHash);
    history.replaceState(null, '', '?' + q.toString());
  } catch (e) {
    $('genStatus').textContent = 'Error: ' + (e.shortMessage || e.message);
  } finally {
    $('genBtn').disabled = false;
    $('genProgress').classList.add('hidden');
  }
}
// A person pressing the button starts a new statement, so an old "expect" hash no longer applies.
$('genBtn').addEventListener('click', (e) => { if (e.isTrusted) expectedHash = null; generate(); });

function renderStatement(st) {
  const s = st.summary;
  const n = NETWORKS[s.chainId];
  const d = s.decimals;
  $('result').classList.remove('hidden');
  $('amtHead').textContent = `Amount (${s.symbol || 'token'})`;
  $('resMeta').innerHTML = `${addrLink(s.account, n)} · ${esc(s.symbol)} ${addrLink(s.token, n)} · blocks ${s.fromBlock.toLocaleString()} → ${s.toBlock.toLocaleString()} · ${s.count.toLocaleString()} transfers`;
  const stat = (k, v, cls = '', sub = '') => `<div class="stat"><div class="k">${k}</div><div class="v ${cls}">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
  $('resStats').innerHTML =
    stat('Opening balance', fmt2(s.opening, d)) +
    stat('Money in', '+' + fmt2(s.totalIn, d), 'in', s.minted ? `of which newly minted: ${fmt2(s.minted, d)}` : '') +
    stat('Money out', '−' + fmt2(s.totalOut, d), 'out', s.burned ? `of which burned: ${fmt2(s.burned, d)}` : '') +
    stat('Unexplained', fmt2(s.unexplained, d)) +
    stat('Closing balance', fmt2(s.closing, d));
  $('reconcile').innerHTML = s.unexplained === 0n
    ? notice('ok', '✔ Fully reconciled: opening + in − out equals the onchain closing balance to the last unit.')
    : notice('warn', `Not fully reconciled: the balance moved by <b>${esc(formatUnits(s.unexplained, d))} ${esc(s.symbol)}</b> more than the Transfer logs explain. This token changes balances without Transfer logs (for example rebasing or fee-on-transfer). The CSV records the difference.`);
  $('resHash').textContent = st.hash;
  $('tableNote').textContent = st.rows.length > 1000 ? `Showing the first 1,000 of ${st.rows.length.toLocaleString()} transfers. The CSV contains all of them.` : '';
  $('rows').innerHTML = st.rows.slice(0, 1000).map((r) => `<tr>
      <td class="mono">${r.block}</td>
      <td class="${r.direction}">${r.direction === 'in' ? 'IN' : 'OUT'}</td>
      <td><span class="pill ${r.kind}">${r.kind}</span></td>
      <td>${r.counterpartyLabel ? `<b>${esc(r.counterpartyLabel)}</b>` : (r.kind === 'mint' || r.kind === 'burn') ? '<span class="muted">zero address</span>' : addrLink(r.counterparty, n)}</td>
      <td class="num ${r.direction}">${r.direction === 'in' ? '+' : '−'}${esc(formatUnits(r.amount, d))}</td>
      <td>${esc(r.reference)}</td>
      <td>${txLink(r.txHash, n)}</td></tr>`).join('') || `<tr><td colspan="7" class="muted">No ${esc(s.symbol || 'token')} transfers in this range.</td></tr>`;
  const live = isLive(dep(s.chainId).registry);
  $('anchorBtn').disabled = !live;
  $('anchorStatus').textContent = live ? '' : 'Registry not deployed on this network yet.';
  lastAnchors = [];
  showAnchors(st.hash, $('existingAnchors'), s.chainId).then((a) => { lastAnchors = a || []; });
  renderTrove(s);
}

async function renderTrove(s) {
  const box = $('troveBox');
  box.classList.add('hidden');
  try {
    const t = await getTroveSnapshot(rpcFor(s.chainId), NETWORKS[s.chainId], s.account);
    if (!t) return;
    const pct = (v) => (Number(v) / 1e16).toFixed(2) + '%';
    const stat = (k, v, sub = '') => `<div class="stat"><div class="k">${k}</div><div class="v">${v}</div>${sub ? `<div class="s">${sub}</div>` : ''}</div>`;
    const debt = t.debt;
    let html = stat('Status', esc(t.status)) + stat('Collateral', formatUnits(t.coll, 18).slice(0, 10) + ' BTC', t.collUsd ? '≈ $' + fmt2(t.collUsd, 18) : '') + stat('Debt', fmt2(debt, 18) + ' MUSD', `principal ${fmt2(t.principal, 18)} + interest ${formatUnits(t.interest, 18).slice(0, 8)} · ${(t.rateBp / 100).toFixed(2)}% a year`);
    if (t.icr) html += stat('Collateral ratio', pct(t.icr), `liquidation below 110% · BTC would have to fall ${((1 - 1.1 / (Number(t.icr) / 1e18)) * 100).toFixed(1)}%`);
    $('troveStats').innerHTML = html;
    box.classList.remove('hidden');
  } catch (_) { /* a Trove panel is optional */ }
}

function download(name, text, type = 'text/csv') {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type }));
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}
const baseName = () => `musdbooks_${current.summary.account.slice(0, 8)}_${current.summary.fromBlock}-${current.summary.toBlock}`;
$('dlCanonical').addEventListener('click', () => current && download(baseName() + '.csv', current.csv));
$('dlLender').addEventListener('click', async () => {
  if (!current) return;
  const s = current.summary;
  $('dlLender').disabled = true;
  try {
    let trove = null;
    try { trove = await getTroveSnapshot(rpcFor(s.chainId), NETWORKS[s.chainId], s.account); } catch (_) { /* report without a Trove section */ }
    const q = new URLSearchParams({ account: s.account, from: s.fromBlock, to: s.toBlock, net: s.chainId === MEZO_MAINNET.id ? 'mainnet' : 'testnet', expect: current.hash });
    if ($('tokenSel').value === 'custom') q.set('token', s.token);
    const md = buildLenderReport({ net: NETWORKS[s.chainId], summary: s, hash: current.hash, anchors: lastAnchors, trove, reviewUrl: `${location.origin}${location.pathname}?${q}` });
    download(baseName() + '_lender_report.md', md, 'text/markdown');
  } finally {
    $('dlLender').disabled = false;
  }
});
$('dlReport').addEventListener('click', () => {
  if (!current) return;
  const d = current.summary.decimals;
  const rate = parseFloat(($('idrRate').value || '').replace(/,/g, ''));
  const hasRate = rate > 0;
  const head = ['block', 'tx_hash', 'direction', 'kind', 'counterparty', 'amount', ...(hasRate ? ['amount_idr'] : []), 'running_balance', 'reference'];
  const lines = [head.join(',')];
  for (const r of current.rows) {
    const amt = formatUnits(r.amount, d);
    const cells = [r.block, r.txHash, r.direction, r.kind, r.counterpartyLabel || r.counterparty, amt,
      ...(hasRate ? [Math.round(parseFloat(amt) * rate)] : []),
      formatUnits(r.running, d), r.reference];
    lines.push(cells.map((c) => (/[",\n]/.test(String(c)) ? `"${String(c).replace(/"/g, '""')}"` : c)).join(','));
  }
  download(baseName() + '_report.csv', lines.join('\n') + '\n');
});

async function showAnchors(hash, el, chainId = net.id) {
  const registry = dep(chainId).registry;
  if (!isLive(registry)) { el.innerHTML = '<div class="muted" style="margin-top:8px">Registry not deployed on this network.</div>'; return []; }
  try {
    const anchors = await clients[chainId].readContract({ address: registry, abi: REGISTRY_ABI, functionName: 'getAnchors', args: [hash] });
    const n = NETWORKS[chainId];
    el.innerHTML = anchors.length
      ? notice('ok', `Anchored ${anchors.length}×: ` + anchors.map((a) => `${addrLink(a.attester, n)} at block ${a.anchoredAt}${a.label ? ` (“${esc(a.label)}”)` : ''}`).join('; '))
      : '<div class="muted" style="margin-top:8px">Not anchored yet.</div>';
    return anchors;
  } catch (e) {
    el.innerHTML = notice('bad', 'Registry lookup failed: ' + esc(e.shortMessage || e.message));
    return [];
  }
}

$('anchorBtn').addEventListener('click', async () => {
  if (!current) return;
  const s = current.summary;
  const label = $('label').value.trim();
  if (new TextEncoder().encode(label).length > 96) { $('anchorStatus').textContent = 'Label too long.'; return; }
  try {
    $('anchorBtn').disabled = true;
    await connect(s.chainId);
    $('anchorStatus').textContent = 'Confirm in your wallet…';
    const hash = await writeWithGas(clients[s.chainId], {
      account: walletAccount, address: dep(s.chainId).registry, abi: REGISTRY_ABI, functionName: 'anchor',
      args: [current.hash, getAddress(s.account), getAddress(s.token), BigInt(s.fromBlock), BigInt(s.toBlock), label],
    });
    $('anchorStatus').innerHTML = 'Submitted ' + txLink(hash, NETWORKS[s.chainId]) + ' — waiting…';
    const rc = await waitReceipt(clients[s.chainId], hash);
    $('anchorStatus').innerHTML = rc.status === 'success' ? '✔ Anchored in ' + txLink(hash, NETWORKS[s.chainId]) : 'Transaction reverted ' + txLink(hash, NETWORKS[s.chainId]);
    showAnchors(current.hash, $('existingAnchors'), s.chainId);
  } catch (e) {
    $('anchorStatus').textContent = 'Error: ' + (e.shortMessage || e.message);
  } finally {
    $('anchorBtn').disabled = false;
  }
});

// ---------- verify
let verifyText = null;
$('verifyFile').addEventListener('change', async () => {
  const f = $('verifyFile').files[0];
  if (!f) return;
  verifyText = await f.text();
  const meta = parseCsvHeader(verifyText);
  const hash = keccak256(toBytes(verifyText));
  const out = $('verifyOut');
  if (!verifyText.startsWith('# musdbooks-statement-v1')) {
    out.innerHTML = notice('bad', 'This is not a MUSD Books canonical statement (missing header).');
    $('rederiveBtn').classList.add('hidden');
    return;
  }
  const chainId = Number(meta.chain_id);
  const netName = (NETWORKS[chainId] || { name: 'unknown chain ' + chainId }).name;
  out.innerHTML = `<p class="muted">${esc(netName)} · account <span class="mono">${esc(meta.account)}</span> · ${esc(meta.token_symbol)} · blocks ${esc(meta.from_block)}–${esc(meta.to_block)}<br/>Hash <span class="mono">${hash}</span></p><div id="verifyAnchors"></div>`;
  const anchors = NETWORKS[chainId] ? await showAnchors(hash, $('verifyAnchors'), chainId) : [];
  if (!anchors.length) $('verifyAnchors').innerHTML = notice('warn', 'No onchain anchor for this exact file. It may have been modified, or it was never anchored.');
  $('rederiveBtn').classList.remove('hidden');
  $('rederiveStatus').textContent = '';
});

$('rederiveBtn').addEventListener('click', async () => {
  if (!verifyText) return;
  const meta = parseCsvHeader(verifyText);
  $('rederiveBtn').disabled = true;
  const prog = $('verifyProgress');
  prog.classList.remove('hidden');
  try {
    $('rederiveStatus').textContent = 'Re-deriving from Mezo chain data…';
    const chainId = Number(meta.chain_id);
    if (!NETWORKS[chainId]) throw new Error('Unsupported chain_id ' + chainId);
    const st = await buildStatement(rpcFor(chainId), NETWORKS[chainId], meta.token, meta.account, Number(meta.from_block), Number(meta.to_block), {
      payAddress: meta.pay_contract === 'none' ? null : meta.pay_contract,
      onProgress: (d, n) => { prog.max = n; prog.value = d; },
    });
    const same = st.csv === verifyText;
    $('rederiveStatus').innerHTML = same
      ? '<span class="in">✔ Identical: every line of this file matches the chain.</span>'
      : '<span class="out">✘ Differs from chain data. This file has been altered or is from a different period.</span>';
  } catch (e) {
    $('rederiveStatus').textContent = 'Error: ' + (e.shortMessage || e.message);
  } finally {
    $('rederiveBtn').disabled = false;
    prog.classList.add('hidden');
  }
});

// ---------- payment request
const AMOUNT_RE = /^\d+(\.\d{1,18})?$/;
$('reqBtn').addEventListener('click', () => {
  const to = $('reqTo').value.trim(), amount = $('reqAmount').value.trim(), ref = $('reqRef').value.trim();
  const out = $('reqOut');
  if (!isAddress(to)) { out.innerHTML = notice('bad', 'Enter a valid address.'); return; }
  if (!AMOUNT_RE.test(amount) || Number(amount) <= 0) { out.innerHTML = notice('bad', 'Amount must be a positive number.'); return; }
  if (!ref) { out.innerHTML = notice('bad', 'Add a reference such as an invoice number.'); return; }
  if (new TextEncoder().encode(ref).length > 96) { out.innerHTML = notice('bad', 'Reference must be at most 96 bytes.'); return; }
  const q = new URLSearchParams({ pay: to, amount, ref, net: net.id === MEZO_MAINNET.id ? 'mainnet' : 'testnet' });
  const url = `${location.origin}${location.pathname}?${q.toString()}`;
  out.innerHTML = `<p>Share this link:</p><p class="mono"><a href="${esc(url)}">${esc(url)}</a></p>
    <div class="actions"><button class="btn secondary" id="copyReq">Copy link</button></div>`;
  $('copyReq').onclick = () => navigator.clipboard.writeText(url);
  renderEmbedKit(out, { to, amount, ref, netName: q.get('net'), url });
});

// Merchant kit: a "Pay with MUSD" button the merchant can paste into any page. Two forms: plain HTML link, or the pay-button.js script.
function renderEmbedKit(container, { to, amount, ref, netName, url }) {
  const base = `${location.origin}${location.pathname.replace(/[^/]*$/, '')}`;
  const linkSnippet = `<a href="${esc(url)}" target="_blank" rel="noopener" style="display:inline-block;padding:10px 18px;border-radius:8px;background:#f7931a;color:#1a1a1a;font:600 15px system-ui,sans-serif;text-decoration:none">Pay ${esc(amount)} MUSD</a>`;
  const scriptSnippet = `<div data-musd-pay data-to="${esc(to)}" data-amount="${esc(amount)}" data-ref="${esc(ref)}" data-net="${esc(netName)}"></div>
<script async src="${esc(base)}pay-button.js"></script>`;
  const box = document.createElement('div');
  box.id = 'embedKit';
  box.innerHTML = `<h3 style="margin:18px 0 4px">Add it to your website</h3>
    <p class="muted">Paste one of these into your page. Customers pay in one transaction and the reference lands in your statement.</p>
    <div class="muted" style="margin:8px 0 4px">Preview</div><div id="embedPreview"></div>
    <div class="muted" style="margin:12px 0 4px">Option 1: plain HTML link (no script)</div>
    <textarea id="embedLink" class="mono" rows="4" readonly spellcheck="false" style="width:100%;box-sizing:border-box;font-size:13px;padding:8px"></textarea>
    <div class="actions"><button class="btn secondary" id="copyEmbedLink">Copy HTML</button></div>
    <div class="muted" style="margin:12px 0 4px">Option 2: script (renders the button for you)</div>
    <textarea id="embedScript" class="mono" rows="4" readonly spellcheck="false" style="width:100%;box-sizing:border-box;font-size:13px;padding:8px"></textarea>
    <div class="actions"><button class="btn secondary" id="copyEmbedScript">Copy HTML</button></div>`;
  container.appendChild(box);
  $('embedPreview').innerHTML = linkSnippet;
  $('embedLink').value = linkSnippet;
  $('embedScript').value = scriptSnippet;
  $('copyEmbedLink').onclick = () => navigator.clipboard.writeText($('embedLink').value);
  $('copyEmbedScript').onclick = () => navigator.clipboard.writeText($('embedScript').value);
}

async function setupPay(params) {
  const to = params.get('pay'), amount = params.get('amount'), ref = params.get('ref') || '';
  if (!isAddress(to) || !AMOUNT_RE.test(amount || '')) return false;
  const payNet = params.get('net') === 'mainnet' ? MEZO_MAINNET : MEZO_TESTNET;
  const tokenAddr = isAddress(params.get('token') || '') ? params.get('token') : payNet.tokens.MUSD.address;
  document.querySelector('nav').classList.add('hidden');
  showTab('pay');
  $('payTo').textContent = to;
  $('payRef').textContent = ref || '(none)';
  $('payNet').textContent = payNet.name;
  let info = { symbol: 'MUSD', decimals: 18 };
  try { info = await getTokenInfo(rpcFor(payNet.id), tokenAddr); } catch (_) { /* keep defaults */ }
  $('payAmount').textContent = `${amount} ${info.symbol}`;
  const payAddr = dep(payNet.id).pay;
  if (!isLive(payAddr)) $('payStatus').innerHTML = notice('warn', 'The MusdPay contract is not deployed on this network yet.');
  $('payBtn').addEventListener('click', async () => {
    try {
      $('payBtn').disabled = true;
      await connect(payNet.id);
      const value = parseUnits(amount, info.decimals);
      const pub = clients[payNet.id];
      const token = getAddress(tokenAddr), merchant = getAddress(to);
      const bal = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'balanceOf', args: [walletAccount] });
      if (bal < value) throw new Error(`Your balance is ${formatUnits(bal, info.decimals)} ${info.symbol}, less than the amount.`);
      let hash;
      try {
        const dom = await pub.readContract({ address: token, abi: PERMIT_ABI, functionName: 'eip712Domain' });
        const nonce = await pub.readContract({ address: token, abi: PERMIT_ABI, functionName: 'nonces', args: [walletAccount] });
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
        $('payStatus').innerHTML = '<p class="muted">Sign the permit in your wallet (no gas)…</p>';
        const sig = await walletClient.signTypedData({
          account: walletAccount,
          domain: { name: dom[1], version: dom[2], chainId: Number(dom[3]), verifyingContract: dom[4] },
          types: { Permit: [
            { name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }, { name: 'value', type: 'uint256' },
            { name: 'nonce', type: 'uint256' }, { name: 'deadline', type: 'uint256' },
          ] },
          primaryType: 'Permit',
          message: { owner: walletAccount, spender: payAddr, value, nonce, deadline },
        });
        const r = '0x' + sig.slice(2, 66), s = '0x' + sig.slice(66, 130);
        let v = parseInt(sig.slice(130, 132), 16); if (v < 27) v += 27;
        $('payStatus').innerHTML = '<p class="muted">Confirm the payment in your wallet…</p>';
        hash = await writeWithGas(pub, {
          account: walletAccount, address: payAddr, abi: PAY_ABI, functionName: 'payWithPermit',
          args: [token, merchant, value, ref, deadline, v, r, s],
        });
      } catch (e) {
        // A rejected signature or transaction ends the flow; anything else (e.g. a token without permit) falls back to approve + pay.
        if (/reject|denied|cancel/i.test(e.shortMessage || e.message || '')) throw e;
      }
      if (!hash) {
        const allowance = await pub.readContract({ address: token, abi: erc20Abi, functionName: 'allowance', args: [walletAccount, payAddr] });
        if (allowance < value) {
          $('payStatus').innerHTML = '<p class="muted">Step 1 of 2: approve in your wallet…</p>';
          const ah = await writeWithGas(pub, { account: walletAccount, address: token, abi: erc20Abi, functionName: 'approve', args: [payAddr, value] });
          await waitReceipt(pub, ah);
        }
        $('payStatus').innerHTML = '<p class="muted">Confirm the payment in your wallet…</p>';
        hash = await writeWithGas(pub, { account: walletAccount, address: payAddr, abi: PAY_ABI, functionName: 'pay', args: [token, merchant, value, ref] });
      }
      $('payStatus').innerHTML = `<p class="muted">Submitted ${txLink(hash, payNet)} — waiting…</p>`;
      const rc = await waitReceipt(pub, hash);
      $('payStatus').innerHTML = rc.status === 'success'
        ? notice('ok', `✔ Paid. Transaction ${txLink(hash, payNet)}. The reference is recorded onchain and will appear on the merchant's statement.`)
        : notice('bad', `Transaction reverted: ${txLink(hash, payNet)}`);
    } catch (e) {
      $('payStatus').innerHTML = notice('bad', esc(e.shortMessage || e.message));
    } finally {
      $('payBtn').disabled = false;
    }
  });
  // Enabled only now that the click handler exists (it used to be clickable before that, and the click did nothing).
  $('payBtn').disabled = !isLive(payAddr);
  return true;
}

// ---------- demo links (filled in after the demo is deployed; see README)
function refreshDemoLinks() {
  const demo = dep(net.id).demo;
  $('demoLinks').innerHTML = demo
    ? `New here? <a href="?account=${demo.account}&from=${demo.from}&to=${demo.to}&net=${net.id === MEZO_MAINNET.id ? 'mainnet' : 'testnet'}">Open the demo merchant's statement</a>, or <a href="./demo-statement.csv" download>download its CSV</a> and try the Verify tab.`
    : 'Paste any Mezo address. On Mainnet, the MUSD / BTC pool or a Trove borrower makes a good example.';
}
refreshDemoLinks();

// ---------- boot from URL
(async () => {
  const params = new URLSearchParams(location.search);
  if (await setupPay(params)) return;
  if (params.get('net') === 'mainnet') { net = MEZO_MAINNET; $('network').value = String(MEZO_MAINNET.id); refreshDemoLinks(); }
  const a = params.get('account'), f = params.get('from'), t = params.get('to'), tk = params.get('token');
  if (isAddress(a || '')) {
    $('acct').value = a;
    if (isAddress(tk || '')) { $('tokenSel').value = 'custom'; $('tokenRow').classList.remove('hidden'); $('tokenAddr').value = tk; }
    if (HASH_RE.test(params.get('expect') || '')) expectedHash = params.get('expect');
    if (f && t) {
      $('preset').value = 'blocks';
      $('blocksRow').classList.remove('hidden');
      $('fromBlock').value = f; $('toBlock').value = t;
      $('genBtn').click();
    }
  }
})();

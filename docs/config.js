// Deployments per chain id. Addresses are filled in after deployment (see README, "Deployments").
const ZERO = '0x0000000000000000000000000000000000000000';

export const DEPLOYMENTS = {
  // Mezo Testnet
  31611: { registry: '0x431785e21f9224c53aa37108d14cfa865279d23c', registryDeployBlock: 16192197, pay: '0x5fa72a1821254a49d7c0af692115a4dabe81921a', demo: { account: '0x21F5ae9d165a7E0EFDaf17A85c225713199eC439', from: 16192210, to: 16192312 } },
  // Mezo Mainnet: v2 contracts (reentrancy lock), deployed and verified 13 Nov 2026
  31612: { registry: '0x431785e21f9224c53aa37108d14cfa865279d23c', registryDeployBlock: 13186810, pay: '0x5fa72a1821254a49d7c0af692115a4dabe81921a' },
};

export const isLive = (addr) => !!addr && addr !== ZERO;

export const REGISTRY_ABI = [
  {
    type: 'function', name: 'anchor', stateMutability: 'nonpayable',
    inputs: [
      { name: 'statementHash', type: 'bytes32' },
      { name: 'account', type: 'address' },
      { name: 'token', type: 'address' },
      { name: 'fromBlock', type: 'uint64' },
      { name: 'toBlock', type: 'uint64' },
      { name: 'label', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'getAnchors', stateMutability: 'view',
    inputs: [{ name: 'statementHash', type: 'bytes32' }],
    outputs: [{
      type: 'tuple[]',
      components: [
        { name: 'attester', type: 'address' },
        { name: 'account', type: 'address' },
        { name: 'token', type: 'address' },
        { name: 'fromBlock', type: 'uint64' },
        { name: 'toBlock', type: 'uint64' },
        { name: 'anchoredAt', type: 'uint64' },
        { name: 'label', type: 'string' },
      ],
    }],
  },
];

export const PAY_ABI = [
  {
    type: 'function', name: 'pay', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' }, { name: 'merchant', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'ref', type: 'string' },
    ],
    outputs: [],
  },
  {
    type: 'function', name: 'payWithPermit', stateMutability: 'nonpayable',
    inputs: [
      { name: 'token', type: 'address' }, { name: 'merchant', type: 'address' },
      { name: 'amount', type: 'uint256' }, { name: 'ref', type: 'string' },
      { name: 'deadline', type: 'uint256' }, { name: 'v', type: 'uint8' },
      { name: 'r', type: 'bytes32' }, { name: 's', type: 'bytes32' },
    ],
    outputs: [],
  },
];

// EIP-5267 domain + EIP-2612 nonces, as exposed by OpenZeppelin's ERC20Permit (which MUSD uses).
export const PERMIT_ABI = [
  {
    type: 'function', name: 'eip712Domain', stateMutability: 'view', inputs: [],
    outputs: [
      { name: 'fields', type: 'bytes1' }, { name: 'name', type: 'string' }, { name: 'version', type: 'string' },
      { name: 'chainId', type: 'uint256' }, { name: 'verifyingContract', type: 'address' },
      { name: 'salt', type: 'bytes32' }, { name: 'extensions', type: 'uint256[]' },
    ],
  },
  { type: 'function', name: 'nonces', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] },
];

// Mezo MUSD core contracts used for actions taken from inside MUSD Books (addresses live in engine.js NETWORKS).
// BorrowerOperations: repay MUSD and add BTC collateral to the caller's own Trove. The hints are positions in the
// sorted Trove list; HintHelpers.getApproxHint + SortedTroves.findInsertPosition compute them (zero hints also work, at more gas).
export const BORROWER_OPS_ABI = [
  { type: 'function', name: 'repayMUSD', stateMutability: 'nonpayable', inputs: [{ name: '_amount', type: 'uint256' }, { name: '_upperHint', type: 'address' }, { name: '_lowerHint', type: 'address' }], outputs: [] },
  { type: 'function', name: 'addColl', stateMutability: 'payable', inputs: [{ name: '_upperHint', type: 'address' }, { name: '_lowerHint', type: 'address' }], outputs: [] },
  { type: 'function', name: 'minNetDebt', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];
export const HINT_HELPERS_ABI = [
  { type: 'function', name: 'getApproxHint', stateMutability: 'view', inputs: [{ name: '_CR', type: 'uint256' }, { name: '_numTrials', type: 'uint256' }, { name: '_inputRandomSeed', type: 'uint256' }], outputs: [{ name: 'hintAddress', type: 'address' }, { name: 'diff', type: 'uint256' }, { name: 'latestRandomSeed', type: 'uint256' }] },
];
export const SORTED_TROVES_ABI = [
  { type: 'function', name: 'findInsertPosition', stateMutability: 'view', inputs: [{ name: '_NICR', type: 'uint256' }, { name: '_prevId', type: 'address' }, { name: '_nextId', type: 'address' }], outputs: [{ type: 'address' }, { type: 'address' }] },
  { type: 'function', name: 'getSize', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
];
// StabilityPool: deposit MUSD (the pool pulls it with transferFrom, so the depositor approves first) and withdraw it.
// Both calls also pay out any pending BTC gain from liquidations to the depositor.
export const STABILITY_POOL_ABI = [
  { type: 'function', name: 'provideToSP', stateMutability: 'nonpayable', inputs: [{ name: '_amount', type: 'uint256' }], outputs: [] },
  { type: 'function', name: 'withdrawFromSP', stateMutability: 'nonpayable', inputs: [{ name: '_amount', type: 'uint256' }], outputs: [] },
];

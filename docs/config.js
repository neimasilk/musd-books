// Deployments per chain id. Addresses are filled in after deployment (see README, "Deployments").
const ZERO = '0x0000000000000000000000000000000000000000';

export const DEPLOYMENTS = {
  // Mezo Testnet
  31611: { registry: '0x431785e21f9224c53aa37108d14cfa865279d23c', registryDeployBlock: 16192197, pay: '0x5fa72a1821254a49d7c0af692115a4dabe81921a', demo: { account: '0x21F5ae9d165a7E0EFDaf17A85c225713199eC439', from: 16192210, to: 16192312 } },
  // Mezo Mainnet (not deployed: the hackathon build runs on testnet, which the program accepts)
  31612: { registry: ZERO, registryDeployBlock: 0, pay: ZERO },
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

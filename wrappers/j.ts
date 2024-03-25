import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  toNano,
} from "@ton/core";

export type JConfig = {
  totalSupply: bigint;
  adminAddr: Address;
  content: Cell;
  jettonWalletCode: Cell;
};

export class J implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static createFromAddress(address: Address) {
    return new J(address);
  }

  static createFromConfig(config: JConfig, code: Cell, workchain = 0) {
    const data = J.buildDataCellFromConfig(config);
    const init = { code, data };
    return new J(contractAddress(workchain, init), init);
  }

  static buildDataCellFromConfig(config: JConfig): Cell {
    return beginCell()
      .storeCoins(config.totalSupply)
      .storeAddress(config.adminAddr)
      .storeRef(config.content)
      .storeRef(config.jettonWalletCode)
      .endCell();
  }

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async sendMint(
    provider: ContractProvider,
    via: Sender,
    params: {
      value: bigint;
      address: Address;
      amount: bigint;
    },
  ) {
    return await provider.internal(via, {
      value: params.value,
      body: beginCell()
        .storeUint(21, 32)
        .storeUint(0, 64)
        .storeAddress(params.address)
        .storeCoins(params.value || toNano("0.2"))
        .storeRef(
          beginCell()
            .storeUint(0x178d4519, 32)
            .storeUint(0, 64)
            .storeCoins(params.amount)
            .storeAddress(null)
            .storeAddress(null)
            .storeCoins(0)
            .storeBit(false)
            .endCell(),
        )
        .endCell(),
    });
  }

  static buildBodyChangeAdmin({
    admin,
    queryId = 0,
  }: {
    admin: Address;
    queryId?: number;
  }) {
    return beginCell()
      .storeUint(3, 32)
      .storeUint(queryId, 64)
      .storeAddress(admin)
      .endCell();
  }

  async sendMsg(
    provider: ContractProvider,
    via: Sender,
    params: {
      value: bigint;
      body: Cell;
    },
  ) {
    return await provider.internal(via, {
      value: params.value,
      body: params.body,
    });
  }

  async getWalletAddress(provider: ContractProvider, owner: Address) {
    const { stack } = await provider.get("get_wallet_address", [
      { type: "slice", cell: beginCell().storeAddress(owner).endCell() },
    ]);
    const [address] = [stack.readAddress()];

    return {
      address,
    };
  }

  async getJettonData(provider: ContractProvider) {
    const { stack } = await provider.get("get_jetton_data", []);
    const [totalSupply, mintable, adminAddr, content, walletCode] = [
      stack.readBigNumber(),
      stack.readBoolean(),
      stack.readAddress(),
      stack.readCell(),
      stack.readCell(),
    ];

    return {
      totalSupply,
      mintable,
      adminAddr,
      content,
      walletCode,
    };
  }
}

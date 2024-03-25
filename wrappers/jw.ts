import {
  Address,
  beginCell,
  Cell,
  Contract,
  ContractProvider,
  Dictionary,
  Sender,
} from "@ton/core";

export type JwConfig = {};

export class Jw implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static OP_CODES = {
    TRANSFER: BigInt(0xf8a7ea5),
  };

  static createFromAddress(address: Address) {
    return new Jw(address);
  }

  static buildSendTransferMsg(params: {
    jettonAmount: bigint;
    destAddr: Address;
    responseAddr: Address;
    customPayload: Dictionary<any, any>;
    forwardToncoinAmount: bigint;
    forwardPayload?: Cell;
  }) {
    return beginCell()
      .storeUint(Jw.OP_CODES.TRANSFER, 32)
      .storeUint(0, 64)
      .storeCoins(params.jettonAmount)
      .storeAddress(params.destAddr)
      .storeAddress(params.responseAddr)
      .storeDict(params.customPayload)
      .storeCoins(params.forwardToncoinAmount)
      .storeMaybeRef(params.forwardPayload || null)
      .endCell();
  }

  async sendTransfer(
    provider: ContractProvider,
    via: Sender,
    params: {
      coinAmount: bigint;
      jettonAmount: bigint;
      destAddr: Address;
      responseAddr: Address;
      customPayload: Dictionary<any, any>;
      forwardToncoinAmount: bigint;
      forwardPayload?: Cell;
    },
  ) {
    return await provider.internal(via, {
      value: params.coinAmount,
      body: beginCell()
        .storeUint(Jw.OP_CODES.TRANSFER, 32)
        .storeUint(0, 64)
        .storeCoins(params.jettonAmount)
        .storeAddress(params.destAddr)
        .storeAddress(params.responseAddr)
        .storeDict(params.customPayload)
        .storeCoins(params.forwardToncoinAmount)
        .storeMaybeRef(params.forwardPayload || null)
        .endCell(),
    });
  }

  async getBalance(provider: ContractProvider) {
    const state = await provider.getState();
    if (state.state.type !== "active") {
      return { amount: 0n };
    }
    const { stack } = await provider.get("get_wallet_data", []);
    const [amount] = [stack.readBigNumber()];
    return { amount };
  }
}

import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
} from "@ton/core";

export type MintRecordCfg = {
  inited: boolean;
  mintHash: bigint;
  bridge: Address;
};

export class MintRecord implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static Ops = {
    INIT: BigInt(0x17686f38),
  };

  static Errors = {
    ALREADY_INITED: 2001,
    BAD_SENDER: 2002,
  };

  static createFromAddress(address: Address) {
    return new MintRecord(address);
  }

  static async createFromCfg(cfg: MintRecordCfg, code: Cell, workchain = 0) {
    const data = await MintRecord.buildDataCellFromCfg(cfg);
    const init = { code, data };
    return new MintRecord(contractAddress(workchain, init), init);
  }

  static async buildDataCellFromCfg(cfg: MintRecordCfg): Promise<Cell> {
    return beginCell()
      .storeUint(cfg.inited ? 1 : 0, 1)
      .storeUint(cfg.mintHash, 256)
      .storeAddress(cfg.bridge)
      .endCell();
  }

  async getStoredData(provider: ContractProvider): Promise<MintRecordCfg> {
    const { stack } = await provider.get("get_stored_data", []);
    const [inited, mintHash, bridge] = [
      stack.readNumber() === 1 ? true : false,
      stack.readBigNumber(),
      stack.readAddress(),
    ];

    return {
      inited,
      mintHash,
      bridge,
    };
  }
}

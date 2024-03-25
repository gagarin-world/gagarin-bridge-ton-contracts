import {
  Address,
  beginCell,
  Cell,
  Contract,
  contractAddress,
  ContractProvider,
  Sender,
  SendMode,
  Slice,
} from "@ton/core";
import { sign } from "@ton/crypto";
import { MintRecord } from "./mint-record";

export type SlaveBridgeCfg = {
  state: SlaveBridgeStates;
  validatorPubkey: bigint;
  masterBridge: bigint;
  admin: Address;
  jAddr: Address;
  jwCode: Cell;
  mintRecordCode: Cell;
};

export type SlaveBridgeMint = {
  id: bigint;
  masterBridge: bigint;
  time: number;
  sender: bigint;
  amount: bigint;
  receiver: Address;
};

export enum SlaveBridgeStates {
  STOPPED = 0,
  RUNNING = 1,
}

export class SlaveBridge implements Contract {
  constructor(
    readonly address: Address,
    readonly init?: { code: Cell; data: Cell },
  ) {}

  static Ops = {
    MINT: BigInt(0x385deaa4),
    BURN: BigInt(0x6e1704c1),
    CHANGE_DATA: BigInt(0xc3e1f13e),
  };

  static Logs = {
    MINT: BigInt(0x2497ff46),
    BURN: BigInt(0x72dd1123),
  };

  static Errors = {
    BAD_SENDER_JW: 1001,
    BAD_SENDER_MINT_RECORD: 1002,
    BAD_SIGNATURE: 1003,
    BAD_MASTER_BRIDGE: 1004,
    BAD_MSG_VALUE: 1005,
    BAD_SENDER_ADMIN: 1006,
    STOPPED: 1007,
  };

  static buildMint = async ({
    slaveBridge,
    validatorSecret,
    mint: { id, masterBridge, time, sender, amount, receiver },
  }: {
    slaveBridge: any;
    validatorSecret: Buffer;
    mint: SlaveBridgeMint;
  }) => {
    const mintSlice = SlaveBridge.buildBodyMint({
      mintSig: Buffer.alloc(64),
      mint: {
        id,
        masterBridge,
        time,
        sender,
        amount,
        receiver,
      },
    })
      .beginParse()
      .loadRef()
      .beginParse();
    const mintHash = await slaveBridge.getMintHash([mintSlice]);
    const mintSig = await sign(
      Buffer.from(mintHash.toString(16), "hex"),
      validatorSecret,
    );
    return {
      mintSig,
      mintSlice,
      mintHash,
      mint: {
        id,
        masterBridge,
        time,
        sender,
        amount,
        receiver,
      },
    };
  };

  static createFromAddress(address: Address) {
    return new SlaveBridge(address);
  }

  static async createFromCfg(cfg: SlaveBridgeCfg, code: Cell, workchain = 0) {
    const data = await SlaveBridge.buildDataCellFromCfg(cfg);
    const init = { code, data };
    return new SlaveBridge(contractAddress(workchain, init), init);
  }

  static async buildDataCellFromCfg(cfg: SlaveBridgeCfg): Promise<Cell> {
    return beginCell()
      .storeUint(cfg.state, 4)
      .storeUint(cfg.validatorPubkey, 256)
      .storeUint(cfg.masterBridge, 160)
      .storeAddress(cfg.admin)
      .storeAddress(cfg.jAddr)
      .storeRef(cfg.jwCode)
      .storeRef(cfg.mintRecordCode)
      .endCell();
  }

  static buildBurnPayload({ receiver }: { receiver: bigint }) {
    return beginCell()
      .storeUint(SlaveBridge.Ops.BURN, 32)
      .storeUint(receiver, 256)
      .endCell();
  }

  static buildBodyMint({
    queryId = 0,
    mintSig,
    mint,
  }: {
    queryId?: number;
    mintSig: Buffer;
    mint: SlaveBridgeMint;
  }) {
    return beginCell()
      .storeUint(SlaveBridge.Ops.MINT, 32)
      .storeUint(queryId, 64)
      .storeBuffer(mintSig, 64)
      .storeRef(
        beginCell()
          .storeUint(mint.id, 128)
          .storeUint(mint.masterBridge, 160)
          .storeUint(mint.time, 64)
          .storeUint(mint.sender, 160)
          .storeCoins(mint.amount)
          .storeAddress(mint.receiver)
          .endCell(),
      )
      .endCell();
  }

  static async buildChangeDataPayload({
    queryId = 0,
    data,
  }: {
    queryId?: number;
    data: SlaveBridgeCfg;
  }) {
    return beginCell()
      .storeUint(SlaveBridge.Ops.CHANGE_DATA, 32)
      .storeUint(queryId, 64)
      .storeRef(await SlaveBridge.buildDataCellFromCfg(data))
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

  async sendDeploy(provider: ContractProvider, via: Sender, value: bigint) {
    await provider.internal(via, {
      value,
      sendMode: SendMode.PAY_GAS_SEPARATELY,
      body: beginCell().endCell(),
    });
  }

  async getStoredData(provider: ContractProvider): Promise<SlaveBridgeCfg> {
    const { stack } = await provider.get("get_stored_data", []);
    const [
      state,
      validatorPubkey,
      masterBridge,
      admin,
      jAddr,
      jwCode,
      mintRecordCode,
    ] = [
      stack.readNumber() as SlaveBridgeStates,
      stack.readBigNumber(),
      stack.readBigNumber(),
      stack.readAddress(),
      stack.readAddress(),
      stack.readCell(),
      stack.readCell(),
    ];

    return {
      state,
      validatorPubkey,
      masterBridge,
      admin,
      jAddr,
      jwCode,
      mintRecordCode,
    };
  }

  async getMintHash(
    provider: ContractProvider,
    args: [Slice],
  ): Promise<bigint> {
    const { stack } = await provider.get("get_mint_hash", [
      { type: "slice", cell: beginCell().storeSlice(args[0]).endCell() },
    ]);
    const [hash] = [stack.readBigNumber()];

    return hash;
  }

  async getMintRecord(
    provider: ContractProvider,
    args: [bigint],
  ): Promise<MintRecord> {
    const { stack } = await provider.get("get_mint_record", [
      { type: "int", value: args[0] },
    ]);
    const [mintRecordAddr] = [stack.readAddress()];
    return MintRecord.createFromAddress(mintRecordAddr);
  }
}

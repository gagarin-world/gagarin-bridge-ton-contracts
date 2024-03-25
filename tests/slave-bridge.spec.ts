import { compile } from "@ton/blueprint";
import { Cell, Dictionary, beginCell, toNano } from "@ton/core";
import { KeyPair, mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";
import { Blockchain, SandboxContract, TreasuryContract } from "@ton/sandbox";
import "@ton/test-utils";
import { randomBytes } from "crypto";
import buildJ from "../utils/build-j";
import expectFail from "../utils/expect-fail";
import expectSuccess from "../utils/expect-success";
import {
  SlaveBridge,
  SlaveBridgeCfg,
  SlaveBridgeMint,
  SlaveBridgeStates,
} from "../wrappers/slave-bridge";
import { bufToBigInt } from "../utils/convert";
import { Jw } from "../wrappers/jw";
import { J } from "../wrappers/j";
import { MintRecord } from "../wrappers/mint-record";

const checkBridgeData = async ({
  bridge,
  cfg,
}: {
  bridge: SandboxContract<SlaveBridge>;
  cfg: SlaveBridgeCfg;
}) => {
  const data = await bridge.getStoredData();
  expect(data.state).toEqual(cfg.state);
  expect(data.validatorPubkey).toEqual(cfg.validatorPubkey);
  expect(data.masterBridge).toEqual(cfg.masterBridge);
  expect(data.admin.equals(cfg.admin)).toBe(true);
  expect(data.jAddr.equals(cfg.jAddr)).toBe(true);
  expect(data.jwCode.equals(cfg.jwCode)).toBe(true);
};

const INITIAL_MINT_AMOUNT = BigInt(10000) * BigInt(10) ** BigInt(18);
const ETH_ADMIN = BigInt(`0x${randomBytes(20).toString("hex")}`);
const FIRST_BURN_AMOUNT = BigInt(1000) * BigInt(10) ** BigInt(18);
const SECOND_BURN_AMOUNT = BigInt(2000) * BigInt(10) ** BigInt(18);
const MASTER_BRIDGE = bufToBigInt(randomBytes(20));

const MINT_ID_1 = bufToBigInt(randomBytes(16));
const MINT_TIME_1 = Math.floor(Date.now() / 1000);
const MINT_SENDER_1 = bufToBigInt(randomBytes(16));
const MINT_AMOUNT_1 = BigInt(100000000000000000000000000000000000);

const MINT_ID_2 = bufToBigInt(randomBytes(16));
const MINT_TIME_2 = Math.floor(Date.now() / 1000);
const MINT_SENDER_2 = bufToBigInt(randomBytes(16));
const MINT_AMOUNT_2 = BigInt(200000000000000000000000000000000000);

describe("SlaveBridge", () => {
  let bc: Blockchain;

  let admin: SandboxContract<TreasuryContract>;
  let adminJw: SandboxContract<Jw>;
  let user: SandboxContract<TreasuryContract>;
  let userJw: SandboxContract<Jw>;
  let bridgeJw: SandboxContract<Jw>;
  let jwCode: Cell;
  let j: SandboxContract<J>;
  let bridge: SandboxContract<SlaveBridge>;
  let bridgeCfg: SlaveBridgeCfg;
  let validatorKeys: KeyPair;

  let firstMint: SlaveBridgeMint;
  let firstMintHash: bigint;
  let firstMintSig: Buffer;

  beforeAll(async () => {
    validatorKeys = await mnemonicToPrivateKey(await mnemonicNew());

    bc = await Blockchain.create();
    admin = await bc.treasury("admin");
    user = await bc.treasury("user");

    jwCode = await compile("JettonWallet");
    j = await buildJ(bc, {
      adminAddr: admin.getSender().address,
      name: "TEST",
      decimals: BigInt(18),
    });
    await j.sendDeploy(admin.getSender(), toNano("0.1"));

    const bridgeCode = await compile("SlaveBridge");
    bridgeCfg = {
      state: SlaveBridgeStates.RUNNING,
      validatorPubkey: BigInt(`0x${validatorKeys.publicKey.toString("hex")}`),
      masterBridge: MASTER_BRIDGE,
      admin: admin.getSender().address,
      jAddr: j.address,
      jwCode: await compile("JettonWallet"),
      mintRecordCode: await compile("MintRecord"),
    };
    bridge = bc.openContract(
      await SlaveBridge.createFromCfg(bridgeCfg, bridgeCode),
    );
    await bridge.sendDeploy(admin.getSender(), toNano("0.1"));

    adminJw = bc.openContract(
      Jw.createFromAddress(
        (await j.getWalletAddress(admin.getSender().address)).address,
      ),
    );
    userJw = bc.openContract(
      Jw.createFromAddress(
        (await j.getWalletAddress(user.getSender().address)).address,
      ),
    );
    bridgeJw = bc.openContract(
      Jw.createFromAddress((await j.getWalletAddress(bridge.address)).address),
    );

    await j.sendMint(admin.getSender(), {
      value: toNano("0.1"),
      address: admin.getSender().address,
      amount: INITIAL_MINT_AMOUNT,
    });

    expect((await adminJw.getBalance()).amount).toBe(INITIAL_MINT_AMOUNT);

    await j.sendMsg(admin.getSender(), {
      value: toNano("0.1"),
      body: J.buildBodyChangeAdmin({ admin: bridge.address }),
    });
    expect((await j.getJettonData()).adminAddr).toEqualAddress(bridge.address);
  });

  it(`should gets correct bridge stored data`, async () => {
    await checkBridgeData({ bridge, cfg: bridgeCfg });
  });

  it(`should burn`, async () => {
    const { externals } = await adminJw.sendTransfer(admin.getSender(), {
      coinAmount: toNano("0.5"),
      destAddr: bridge.address,
      jettonAmount: FIRST_BURN_AMOUNT,
      responseAddr: admin.getSender().address,
      customPayload: Dictionary.empty(),
      forwardToncoinAmount: toNano("0.3"),
      forwardPayload: SlaveBridge.buildBurnPayload({ receiver: ETH_ADMIN }),
    });
    expect((await adminJw.getBalance()).amount).toEqual(
      INITIAL_MINT_AMOUNT - FIRST_BURN_AMOUNT,
    );
    expect((await bridgeJw.getBalance()).amount).toEqual(BigInt(0));
    expect((await j.getJettonData()).totalSupply).toEqual(
      INITIAL_MINT_AMOUNT - FIRST_BURN_AMOUNT,
    );
    expect(externals.length).toEqual(1);
  });

  it(`should mint if mint with good signature`, async () => {
    const adminBalBf = (await adminJw.getBalance()).amount;
    const jSupplyBf = (await j.getJettonData()).totalSupply;

    const { mint, mintSig, mintHash } = await SlaveBridge.buildMint({
      slaveBridge: bridge,
      validatorSecret: validatorKeys.secretKey,
      mint: {
        id: MINT_ID_1,
        sender: MINT_SENDER_1,
        time: MINT_TIME_1,
        amount: MINT_AMOUNT_1,
        masterBridge: MASTER_BRIDGE,
        receiver: admin.getSender().address,
      },
    });

    firstMint = mint;
    firstMintHash = mintHash;
    firstMintSig = mintSig;

    const { transactions: txs, externals } = await bridge.sendMsg(
      admin.getSender(),
      {
        value: toNano("0.5"),
        body: SlaveBridge.buildBodyMint({ mint, mintSig }),
      },
    );

    const mintRecord = bc.openContract(await bridge.getMintRecord([mintHash]));

    expectSuccess(txs, admin.getSender().address, bridge.address);
    expectSuccess(txs, bridge.address, mintRecord.address);
    expectSuccess(txs, mintRecord.address, bridge.address);
    expectSuccess(txs, bridge.address, j.address);
    expectSuccess(txs, j.address, adminJw.address);
    expectSuccess(txs, adminJw.address, admin.getSender().address);

    const adminBalAf = (await adminJw.getBalance()).amount;
    const jSupplyAf = (await j.getJettonData()).totalSupply;

    expect(jSupplyAf - jSupplyBf).toEqual(mint.amount);
    expect(adminBalAf - adminBalBf).toEqual(mint.amount);

    expect(externals.length).toEqual(1);
  });

  it(`should not mint if mint with the same data`, async () => {
    const adminBalBf = (await adminJw.getBalance()).amount;
    const jSupplyBf = (await j.getJettonData()).totalSupply;

    const { transactions: txs } = await bridge.sendMsg(admin.getSender(), {
      value: toNano("0.5"),
      body: SlaveBridge.buildBodyMint({
        mint: firstMint,
        mintSig: firstMintSig,
      }),
    });

    const mintRecord = bc.openContract(
      await bridge.getMintRecord([firstMintHash]),
    );

    expectSuccess(txs, admin.getSender().address, bridge.address);
    expectFail(
      txs,
      bridge.address,
      mintRecord.address,
      MintRecord.Errors.ALREADY_INITED,
    );
    expectSuccess(txs, mintRecord.address, bridge.address);

    const adminBalAf = (await adminJw.getBalance()).amount;
    const jSupplyAf = (await j.getJettonData()).totalSupply;

    expect(jSupplyAf - jSupplyBf).toEqual(BigInt(0));
    expect(adminBalAf - adminBalBf).toEqual(BigInt(0));
  });

  it(`should throw if mint with bad signature`, async () => {
    const { mint, mintSig } = await SlaveBridge.buildMint({
      slaveBridge: bridge,
      validatorSecret: validatorKeys.secretKey,
      mint: {
        id: MINT_ID_1,
        sender: MINT_SENDER_1,
        time: MINT_TIME_1,
        amount: MINT_AMOUNT_1,
        masterBridge: MASTER_BRIDGE,
        receiver: admin.getSender().address,
      },
    });

    let txs = (
      await bridge.sendMsg(admin.getSender(), {
        value: toNano("0.5"),
        body: SlaveBridge.buildBodyMint({
          mint: { ...mint, id: mint.id + BigInt(1) },
          mintSig,
        }),
      })
    ).transactions;

    expectFail(
      txs,
      admin.getSender().address,
      bridge.address,
      SlaveBridge.Errors.BAD_SIGNATURE,
    );

    txs = (
      await bridge.sendMsg(admin.getSender(), {
        value: toNano("0.5"),
        body: SlaveBridge.buildBodyMint({
          mint,
          mintSig: Buffer.alloc(64),
        }),
      })
    ).transactions;

    expectFail(
      txs,
      admin.getSender().address,
      bridge.address,
      SlaveBridge.Errors.BAD_SIGNATURE,
    );
  });

  it(`should throw if mint with bad master bridge`, async () => {
    const { mint, mintSig } = await SlaveBridge.buildMint({
      slaveBridge: bridge,
      validatorSecret: validatorKeys.secretKey,
      mint: {
        id: MINT_ID_1,
        sender: MINT_SENDER_1,
        time: MINT_TIME_1,
        amount: MINT_AMOUNT_1,
        masterBridge: bufToBigInt(randomBytes(20)),
        receiver: admin.getSender().address,
      },
    });

    const txs = (
      await bridge.sendMsg(admin.getSender(), {
        value: toNano("0.5"),
        body: SlaveBridge.buildBodyMint({
          mint,
          mintSig,
        }),
      })
    ).transactions;

    expectFail(
      txs,
      admin.getSender().address,
      bridge.address,
      SlaveBridge.Errors.BAD_MASTER_BRIDGE,
    );
  });

  it(`should throw if mint with bad msg value`, async () => {
    const { mint, mintSig } = await SlaveBridge.buildMint({
      slaveBridge: bridge,
      validatorSecret: validatorKeys.secretKey,
      mint: {
        id: MINT_ID_1,
        sender: MINT_SENDER_1,
        time: MINT_TIME_1,
        amount: MINT_AMOUNT_1,
        masterBridge: MASTER_BRIDGE,
        receiver: admin.getSender().address,
      },
    });

    const { transactions: txs } = await bridge.sendMsg(admin.getSender(), {
      value: toNano("0.1"),
      body: SlaveBridge.buildBodyMint({ mint, mintSig }),
    });

    expectFail(
      txs,
      admin.getSender().address,
      bridge.address,
      SlaveBridge.Errors.BAD_MSG_VALUE,
    );
  });

  it(`should throw if data is setting not by admin`, async () => {
    const data = await bridge.getStoredData();
    const { transactions: txs } = await bridge.sendMsg(user.getSender(), {
      value: toNano("0.1"),
      body: await SlaveBridge.buildChangeDataPayload({ data }),
    });

    expectFail(
      txs,
      user.getSender().address,
      bridge.address,
      SlaveBridge.Errors.BAD_SENDER_ADMIN,
    );
  });

  it(`should change validator pubkey if data was sended by admin`, async () => {
    const data = await bridge.getStoredData();
    const newValidatorPubkey = bufToBigInt(randomBytes(32));
    const { transactions: txs } = await bridge.sendMsg(admin.getSender(), {
      value: toNano("0.1"),
      body: await SlaveBridge.buildChangeDataPayload({
        data: { ...data, validatorPubkey: newValidatorPubkey },
      }),
    });

    expectSuccess(txs, admin.getSender().address, bridge.address);
    expectSuccess(txs, bridge.address, admin.getSender().address);
    await checkBridgeData({
      bridge,
      cfg: { ...data, validatorPubkey: newValidatorPubkey },
    });
  });

  it(`should throw if someone try to send mint record cb`, async () => {
    const { transactions: txs } = await bridge.sendMsg(admin.getSender(), {
      value: toNano("0.5"),
      body: beginCell()
        .storeUint(MintRecord.Ops.INIT | BigInt(0x80000000), 32)
        .storeUint(0, 64)
        .storeRef(beginCell().storeUint(firstMintHash, 256).endCell())
        .endCell(),
    });

    expectFail(
      txs,
      admin.getSender().address,
      bridge.address,
      SlaveBridge.Errors.BAD_SENDER_MINT_RECORD,
    );
  });

  it(`should change admin if data was sended by admin, then change admin and validator pubkey back`, async () => {
    let data = await bridge.getStoredData();

    let txs = (
      await bridge.sendMsg(admin.getSender(), {
        value: toNano("0.1"),
        body: await SlaveBridge.buildChangeDataPayload({
          data: { ...data, admin: user.address },
        }),
      })
    ).transactions;

    expectSuccess(txs, admin.getSender().address, bridge.address);
    expectSuccess(txs, bridge.address, admin.getSender().address);

    await checkBridgeData({
      bridge,
      cfg: { ...data, admin: user.address },
    });

    data = await bridge.getStoredData();

    txs = (
      await bridge.sendMsg(user.getSender(), {
        value: toNano("0.1"),
        body: await SlaveBridge.buildChangeDataPayload({
          data: {
            ...data,
            validatorPubkey: bridgeCfg.validatorPubkey,
            admin: admin.address,
          },
        }),
      })
    ).transactions;

    await checkBridgeData({
      bridge,
      cfg: bridgeCfg,
    });
  });

  it(`should pause bridge then throw after call mint and burn`, async () => {
    const jSupplyBf = (await j.getJettonData()).totalSupply;

    let data = await bridge.getStoredData();

    let txs = (
      await bridge.sendMsg(admin.getSender(), {
        value: toNano("0.1"),
        body: await SlaveBridge.buildChangeDataPayload({
          data: { ...data, state: SlaveBridgeStates.STOPPED },
        }),
      })
    ).transactions;

    expectSuccess(txs, admin.getSender().address, bridge.address);
    expectSuccess(txs, bridge.address, admin.getSender().address);

    await checkBridgeData({
      bridge,
      cfg: { ...data, state: SlaveBridgeStates.STOPPED },
    });

    const { mint, mintSig } = await SlaveBridge.buildMint({
      slaveBridge: bridge,
      validatorSecret: validatorKeys.secretKey,
      mint: {
        id: MINT_ID_1,
        sender: MINT_SENDER_1,
        time: MINT_TIME_1,
        amount: MINT_AMOUNT_1,
        masterBridge: MASTER_BRIDGE,
        receiver: user.getSender().address,
      },
    });

    txs = (
      await bridge.sendMsg(user.getSender(), {
        value: toNano("0.5"),
        body: SlaveBridge.buildBodyMint({ mint, mintSig }),
      })
    ).transactions;

    expectFail(
      txs,
      user.getSender().address,
      bridge.address,
      SlaveBridge.Errors.STOPPED,
    );

    const adminBalBf = (await adminJw.getBalance()).amount;

    txs = (
      await adminJw.sendTransfer(admin.getSender(), {
        coinAmount: toNano("0.5"),
        destAddr: bridge.address,
        jettonAmount: FIRST_BURN_AMOUNT,
        responseAddr: admin.getSender().address,
        customPayload: Dictionary.empty(),
        forwardToncoinAmount: toNano("0.3"),
        forwardPayload: SlaveBridge.buildBurnPayload({ receiver: ETH_ADMIN }),
      })
    ).transactions;

    expectSuccess(txs, admin.getSender().address, adminJw.address);
    expectSuccess(txs, adminJw.address, bridgeJw.address);
    expectSuccess(txs, bridgeJw.address, bridge.address);
    expectSuccess(txs, bridge.address, bridgeJw.address);
    expectSuccess(txs, bridgeJw.address, adminJw.address);
    expectSuccess(txs, adminJw.address, admin.getSender().address);

    const adminBalAf = (await adminJw.getBalance()).amount;
    const jSupplyAf = (await j.getJettonData()).totalSupply;

    expect(jSupplyBf).toEqual(jSupplyAf);
    expect(adminBalBf).toEqual(adminBalAf);
  });

  it(`should unpause bridge then mint for user and burn for admin`, async () => {
    let data = await bridge.getStoredData();

    let txs = (
      await bridge.sendMsg(admin.getSender(), {
        value: toNano("0.1"),
        body: await SlaveBridge.buildChangeDataPayload({
          data: { ...data, state: SlaveBridgeStates.RUNNING },
        }),
      })
    ).transactions;

    expectSuccess(txs, admin.getSender().address, bridge.address);
    await checkBridgeData({
      bridge,
      cfg: { ...data, state: SlaveBridgeStates.RUNNING },
    });

    const userBalBf = (await userJw.getBalance()).amount;
    let jSupplyBf = (await j.getJettonData()).totalSupply;

    const { mint, mintSig } = await SlaveBridge.buildMint({
      slaveBridge: bridge,
      validatorSecret: validatorKeys.secretKey,
      mint: {
        id: MINT_ID_2,
        sender: MINT_SENDER_2,
        time: MINT_TIME_2,
        amount: MINT_AMOUNT_2,
        masterBridge: MASTER_BRIDGE,
        receiver: user.getSender().address,
      },
    });

    txs = (
      await bridge.sendMsg(user.getSender(), {
        value: toNano("0.5"),
        body: SlaveBridge.buildBodyMint({ mint, mintSig }),
      })
    ).transactions;

    expectSuccess(txs, user.getSender().address, bridge.address);
    expectSuccess(txs, bridge.address, j.address);
    expectSuccess(txs, j.address, userJw.address);
    expectSuccess(txs, userJw.address, user.getSender().address);

    const userBalAf = (await userJw.getBalance()).amount;
    let jSupplyAf = (await j.getJettonData()).totalSupply;

    expect(jSupplyAf - jSupplyBf).toEqual(mint.amount);
    expect(userBalAf - userBalBf).toEqual(mint.amount);

    const adminBalBf = (await adminJw.getBalance()).amount;
    jSupplyBf = (await j.getJettonData()).totalSupply;

    const { externals } = await adminJw.sendTransfer(admin.getSender(), {
      coinAmount: toNano("0.5"),
      destAddr: bridge.address,
      jettonAmount: SECOND_BURN_AMOUNT,
      responseAddr: admin.getSender().address,
      customPayload: Dictionary.empty(),
      forwardToncoinAmount: toNano("0.3"),
      forwardPayload: SlaveBridge.buildBurnPayload({ receiver: ETH_ADMIN }),
    });

    const adminBalAf = (await adminJw.getBalance()).amount;
    jSupplyAf = (await j.getJettonData()).totalSupply;

    expect(jSupplyBf - jSupplyAf).toEqual(SECOND_BURN_AMOUNT);
    expect(adminBalBf - adminBalAf).toEqual(SECOND_BURN_AMOUNT);
    expect(externals.length).toEqual(1);
  });
});

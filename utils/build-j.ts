import { compile } from "@ton/blueprint";
import { Address, Dictionary, beginCell } from "@ton/core";
import { sha256 } from "@ton/crypto";
import { Blockchain, SandboxContract } from "@ton/sandbox";
import "@ton/test-utils";
import { J } from "../wrappers/j";

export const buildJContent = async (name: string, decimals: bigint) => {
  const jettonContent = Dictionary.empty(
    Dictionary.Keys.BigUint(256),
    Dictionary.Values.Cell(),
  );
  jettonContent
    .set(
      BigInt("0x" + (await sha256("name")).toString("hex")),
      beginCell()
        .storeUint(0x00, 8)
        .storeBuffer(Buffer.from(name, "utf8"))
        .endCell(),
    )
    .set(
      BigInt("0x" + (await sha256("decimals")).toString("hex")),
      beginCell()
        .storeUint(0x00, 8)
        .storeBuffer(Buffer.from(decimals.toString(), "utf8"))
        .endCell(),
    );
  return jettonContent;
};

export default async (
  blockchain: Blockchain,
  params: { adminAddr: Address; name: string; decimals: bigint },
) => {
  const jettonMinter: SandboxContract<J> = blockchain.openContract(
    J.createFromConfig(
      {
        totalSupply: BigInt(0),
        adminAddr: params.adminAddr,
        content: beginCell()
          .storeInt(0x00, 8)
          .storeDict(await buildJContent(params.name, params.decimals))
          .endCell(),
        jettonWalletCode: await compile("JettonWallet"),
      },
      await compile("JettonMinter"),
    ),
  );

  return jettonMinter;
};

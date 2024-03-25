import { NetworkProvider } from "@ton/blueprint";
import { Address } from "@ton/core";
import { SlaveBridge } from "../wrappers/slave-bridge";
import { bigIntToBuf } from "../utils/convert";

export async function run(
  provider: NetworkProvider,
  args: {
    bridgeAddr?: string;
    validatorSecret?: string;
    mintId?: string;
    mintMasterBridge?: string;
    mintTime?: string;
    mintSender?: string;
    mintAmount?: string;
    mintReceiver?: string;
  },
) {
  const ui = provider.ui();

  const bridgeAddr = Address.parse(
    args.bridgeAddr ?? (await ui.input("SlaveBridge address")),
  );
  if (!(await provider.isContractDeployed(bridgeAddr))) {
    ui.write(`Error: SlaveBridge at address ${bridgeAddr} is not deployed!`);
    return;
  }

  const validatorSecret = BigInt(
    args.validatorSecret ?? (await ui.input("Validator secret")),
  );
  const mintId = BigInt(args.mintId ?? (await ui.input("Mint Id")));
  const mintMasterBridge = BigInt(
    args.mintMasterBridge ?? (await ui.input("Mint Master Bridge")),
  );
  const mintTime = +(args.mintTime ?? (await ui.input("Mint Time")));
  const mintSender = BigInt(args.mintSender ?? (await ui.input("Mint Sender")));
  const mintAmount = BigInt(args.mintAmount ?? (await ui.input("Mint Amount")));
  const mintReceiver = Address.parse(
    args.mintReceiver ?? (await ui.input("Mint Receiver")),
  );

  const bridge = provider.open(await SlaveBridge.createFromAddress(bridgeAddr));

  const { mint, mintSig } = await SlaveBridge.buildMint({
    slaveBridge: bridge,
    validatorSecret: bigIntToBuf(validatorSecret),
    mint: {
      id: mintId,
      masterBridge: mintMasterBridge,
      time: mintTime,
      sender: mintSender,
      amount: mintAmount,
      receiver: mintReceiver,
    },
  });

  ui.write(`Mint Sig: ${mintSig.toString("hex")}`);
  return ui.write(
    `Mint Data: ${JSON.stringify(
      {
        ...mint,
        masterBridge: mint.masterBridge.toString(16),
        sender: mint.sender.toString(16),
        receiver: mint.receiver.toRawString(),
      },
      (key, value) => (typeof value === "bigint" ? value.toString() : value),
      2,
    )}`,
  );
}

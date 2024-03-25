import { NetworkProvider, sleep } from "@ton/blueprint";
import { Address, toNano } from "@ton/core";
import { getJwBal } from "../utils/jw-bal";
import { SlaveBridge } from "../wrappers/slave-bridge";
import { J } from "../wrappers/j";
import { bigIntToBuf } from "../utils/convert";

export async function run(
  provider: NetworkProvider,
  args: {
    bridgeAddr?: string;
    mintSig: string;
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
  const mintSig = BigInt(args.mintSig ?? (await ui.input("Mint Sig")));
  const mintId = BigInt(args.mintId ?? (await ui.input("Mint Id")));
  const mintMasterBridge = BigInt(
    args.mintMasterBridge ?? (await ui.input("Mint MasterBridge")),
  );
  const mintTime = +(args.mintTime ?? (await ui.input("Mint Time")));
  const mintSender = BigInt(args.mintSender ?? (await ui.input("Mint Sender")));
  const mintAmount = BigInt(args.mintAmount ?? (await ui.input("Mint Amount")));
  const mintReceiver = Address.parse(
    args.mintReceiver ?? (await ui.input("Mint Receiver")),
  );

  if (!(await provider.isContractDeployed(bridgeAddr))) {
    ui.write(`Error: SlaveBridge at address ${bridgeAddr} is not deployed!`);
    return;
  }

  const bridge = provider.open(await SlaveBridge.createFromAddress(bridgeAddr));
  const { jAddr } = await bridge.getStoredData();
  const j = provider.open(J.createFromAddress(jAddr));

  const { jwBal: receiverJwBal, updater: receiverJwBalUpdater } =
    await getJwBal({
      provider,
      jAddrStr: j.address.toRawString(),
      ownerAddrStr: mintReceiver.toRawString(),
    });

  await bridge.sendMsg(provider.sender(), {
    value: toNano("0.5"),
    body: SlaveBridge.buildBodyMint({
      mintSig: bigIntToBuf(mintSig),
      mint: {
        id: mintId,
        masterBridge: mintMasterBridge,
        time: mintTime,
        sender: mintSender,
        amount: mintAmount,
        receiver: mintReceiver,
      },
    }),
  });

  let attempt = 1;
  while (
    receiverJwBal + mintAmount !== (await receiverJwBalUpdater()) &&
    attempt < 10
  ) {
    ui.setActionPrompt(`Attempt ${attempt}/10`);
    await sleep(2000);
    attempt++;
  }
  ui.clearActionPrompt();

  if (attempt >= 10) {
    ui.write("Failed to mint!");
    return;
  }
  return ui.write("Minted successfully!");
}

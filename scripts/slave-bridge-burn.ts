import { NetworkProvider, sleep } from "@ton/blueprint";
import { Address, Dictionary, toNano } from "@ton/core";
import { getJwBal } from "../utils/jw-bal";
import { SlaveBridge } from "../wrappers/slave-bridge";
import { J } from "../wrappers/j";
import { Jw } from "../wrappers/jw";

export async function run(
  provider: NetworkProvider,
  args: {
    bridgeAddr?: string;
    senderAddr?: string;
    amount?: string;
    receiver?: string;
  },
) {
  const ui = provider.ui();

  const bridgeAddr = Address.parse(
    args.bridgeAddr ?? (await ui.input("SlaveBridge address")),
  );
  const senderAddr = Address.parse(
    args.senderAddr ?? (await ui.input("Sender address")),
  );
  const amount = BigInt(args.amount ?? (await ui.input("Amount to send")));
  const receiver = BigInt(
    args.receiver ?? (await ui.input("Receiver address")),
  );

  if (!(await provider.isContractDeployed(bridgeAddr))) {
    ui.write(`Error: SlaveBridge at address ${bridgeAddr} is not deployed!`);
    return;
  }

  const bridge = provider.open(await SlaveBridge.createFromAddress(bridgeAddr));
  const { jAddr } = await bridge.getStoredData();
  const j = provider.open(J.createFromAddress(jAddr));
  const senderJw = provider.open(
    await Jw.createFromAddress((await j.getWalletAddress(senderAddr)).address),
  );

  const { jwBal: senderJwBal, updater: senderJwBalUpdater } = await getJwBal({
    provider,
    jAddrStr: j.address.toRawString(),
    ownerAddrStr: senderAddr.toRawString(),
  });

  await senderJw.sendTransfer(provider.sender(), {
    coinAmount: toNano("0.5"),
    destAddr: bridge.address,
    jettonAmount: amount,
    responseAddr: senderAddr,
    customPayload: Dictionary.empty(),
    forwardToncoinAmount: toNano("0.3"),
    forwardPayload: SlaveBridge.buildBurnPayload({ receiver }),
  });

  let attempt = 1;
  while (
    senderJwBal - amount !== (await senderJwBalUpdater()) &&
    attempt < 10
  ) {
    ui.setActionPrompt(`Attempt ${attempt}/10`);
    await sleep(2000);
    attempt++;
  }
  ui.clearActionPrompt();

  if (attempt >= 10) {
    ui.write("Failed to burn!");
    return;
  }
  return ui.write("Burned successfully!");
}

import { NetworkProvider, compile } from "@ton/blueprint";
import { Address, toNano } from "@ton/core";
import { SlaveBridge, SlaveBridgeStates } from "../wrappers/slave-bridge";
import { J } from "../wrappers/j";

export async function run(
  provider: NetworkProvider,
  args: {
    validatorPubkey?: string;
    masterBridge?: string;
    admin?: string;
    jAddr?: string;
  },
) {
  const ui = provider.ui();

  const validatorPubkey = BigInt(
    args.validatorPubkey ?? (await ui.input("Validator pubkey")),
  );
  const masterBridge = BigInt(
    args.masterBridge ?? (await ui.input("Master bridge")),
  );
  const admin = Address.parse(args.admin ?? (await ui.input("Admin")));
  const jAddr = Address.parse(args.jAddr ?? (await ui.input("Jetton address")));
  const j = provider.open(await J.createFromAddress(jAddr));
  const jwCode = (await j.getJettonData()).walletCode;

  const bridge = provider.open(
    await SlaveBridge.createFromCfg(
      {
        state: SlaveBridgeStates.RUNNING,
        validatorPubkey,
        masterBridge,
        admin,
        jAddr: j.address,
        jwCode,
        mintRecordCode: await compile("MintRecord"),
      },
      await compile("SlaveBridge"),
    ),
  );

  if (await provider.isContractDeployed(bridge.address)) {
    ui.write(`SlaveBridge at address ${bridge.address} already deployed!`);
    return bridge;
  }

  await bridge.sendDeploy(provider.sender(), toNano("0.1"));
  await provider.waitForDeploy(bridge.address);

  return bridge;
}

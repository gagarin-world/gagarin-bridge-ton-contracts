import { NetworkProvider } from "@ton/blueprint";
import { mnemonicNew, mnemonicToPrivateKey } from "@ton/crypto";

export async function run(provider: NetworkProvider, args: {}) {
  const ui = provider.ui();

  const validatorKeys = await mnemonicToPrivateKey(await mnemonicNew());

  ui.write(`Pubkey: 0x${validatorKeys.publicKey.toString("hex")}`);
  ui.write(`Secret: 0x${validatorKeys.secretKey.toString("hex")}`);

  return validatorKeys;
}

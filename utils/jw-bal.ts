import { NetworkProvider } from "@ton/blueprint";
import { Address } from "@ton/core";
import { J } from "../wrappers/j";
import { Jw } from "../wrappers/jw";
export const getJwBal = async ({
  provider,
  jAddrStr,
  ownerAddrStr,
}: {
  provider: NetworkProvider;
  jAddrStr: string;
  ownerAddrStr: string;
}) => {
  const j = provider.open(J.createFromAddress(Address.parse(jAddrStr)));

  const jwAddr = (await j.getWalletAddress(Address.parse(ownerAddrStr)))
    .address;

  const jw = provider.open(await Jw.createFromAddress(jwAddr));

  const updater = async () => (await jw.getBalance()).amount;
  return { jwBal: await updater(), updater };
};

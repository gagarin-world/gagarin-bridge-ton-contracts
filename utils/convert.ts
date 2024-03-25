export const bufToBigInt = (buf: Buffer) => BigInt(`0x${buf.toString("hex")}`);
export const bigIntToBuf = (bi: bigint, bytes?: number) => {
  let hexString = bi.toString(16);
  if (bytes && hexString.length < bytes * 2) {
    hexString = "0".repeat(bytes * 2 - hexString.length) + hexString;
  }
  return Buffer.from(hexString, "hex");
};

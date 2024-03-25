import { Address, Transaction } from "@ton/core";

export default (
  transactions: Transaction[],
  from: Address,
  to: Address,
  exitCode: number,
  deploy: boolean = false,
) => {
  const isDeploy = deploy ? { deploy: true } : {};
  expect(transactions).toHaveTransaction({
    from: from,
    to: to,
    ...isDeploy,
    exitCode,
    aborted: true,
  });
};

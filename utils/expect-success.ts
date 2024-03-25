import { Address, Transaction } from "@ton/core";

export default (
  transactions: Transaction[],
  from: Address,
  to: Address,
  deploy: boolean = false,
) => {
  const isDeploy = deploy ? { deploy: true } : {};
  expect(transactions).toHaveTransaction({
    from,
    to,
    ...isDeploy,
    exitCode: 0,
    aborted: false,
  });
};

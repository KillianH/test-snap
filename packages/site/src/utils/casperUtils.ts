import {
  Args,
  CLValue,
  CLValueOption,
  CLValueUInt512,
  CLValueUInt64,
  Deploy,
  DeployHeader,
  Duration,
  ExecutableDeployItem,
  FixedMode,
  InitiatorAddr,
  PricingMode,
  PublicKey,
  Timestamp,
  TransactionEntryPoint,
  TransactionEntryPointEnum,
  TransactionScheduling,
  TransactionTarget,
  TransactionV1,
  TransactionV1Payload,
  TransferDeployItem,
} from 'casper-js-sdk';

/**
 * Create a legacy deploy
 *
 * @param publicKey - Public Key hex string
 * @returns A legacy deploy
 */
export function createLegacyDeploy(publicKey: string) {
  const recipientKey = PublicKey.fromHex(
    '010068920746ecf5870e18911EE1fC5db975E0e97fFFcBBF52f5045Ad6C9838D2F',
  );
  const paymentAmount = '10000000000000';
  const transferAmount = '10';
  const transferId = 35;

  const session = new ExecutableDeployItem();

  session.transfer = TransferDeployItem.newTransfer(
    transferAmount,
    recipientKey,
    undefined,
    transferId,
  );

  const payment = ExecutableDeployItem.standardPayment(paymentAmount);

  const deployHeader = DeployHeader.default();
  deployHeader.account = PublicKey.fromHex(publicKey);
  deployHeader.chainName = 'casper-test';

  return Deploy.toJson(Deploy.makeDeploy(deployHeader, payment, session));
}

/**
 * Create a legacy deploy
 *
 * @param publicKey - Public Key hex string
 * @returns A legacy deploy
 */
export function createTransaction(publicKey: string) {
  const timestamp = new Timestamp(new Date());
  const paymentAmount = '20000000000000';

  const pricingMode = new PricingMode();
  const fixedMode = new FixedMode();
  fixedMode.gasPriceTolerance = 1;
  fixedMode.additionalComputationFactor = 0;
  pricingMode.fixed = fixedMode;

  const args = Args.fromMap({
    target: CLValue.newCLPublicKey(
      PublicKey.fromHex(
        '0202f5a92ab6da536e7b1a351406f3744224bec85d7acbab1497b65de48a1a707b64',
      ),
    ),
    amount: CLValueUInt512.newCLUInt512(paymentAmount),
    id: CLValueOption.newCLOption(CLValueUInt64.newCLUint64(3)), // memo ( optional )
  });

  const transactionTarget = new TransactionTarget({}); // Native target;
  const entryPoint = new TransactionEntryPoint(
    TransactionEntryPointEnum.Transfer,
  );
  const scheduling = new TransactionScheduling({}); // Standard;

  const transactionPayload = TransactionV1Payload.build({
    initiatorAddr: new InitiatorAddr(PublicKey.fromHex(publicKey)),
    ttl: new Duration(1800000),
    args,
    timestamp,
    entryPoint,
    scheduling,
    transactionTarget,
    chainName: 'casper-net-1',
    pricingMode,
  });

  const jsonTransaction = TransactionV1.toJson(
    TransactionV1.makeTransactionV1(transactionPayload),
  );

  console.log('TRANSACTION START');
  console.log(jsonTransaction);
  console.log('TRANSACTION STOP');

  return jsonTransaction;
}

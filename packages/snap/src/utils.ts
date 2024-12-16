/* eslint-disable no-case-declarations */
import { FixedNumber } from '@ethersproject/bignumber';
import type {
  CLValue,
  CLValueTuple1,
  CLValueList,
  CLValueMap,
  CLValueTuple2,
  CLValueTuple3,
  CLValueByteArray,
  CLValueOption,
  URef,
  Key,
} from 'casper-js-sdk';
import {
  Conversions,
  Transaction,
  AccountHash,
  PublicKey,
  TypeID,
} from 'casper-js-sdk';
import type { CLValueResult } from 'casper-js-sdk/dist/types/clvalue/Result';
import type { TransferDeployItem } from 'casper-js-sdk/dist/types/ExecutableDeployItem';

/**
 * Sanitise nested lists.
 *
 * @param value - A value from a list.
 * @returns Sanitised value.
 */
function sanitiseNestedLists(value: any) {
  const parsedValue = parseDeployArg(value);
  if (Array.isArray(parsedValue)) {
    const parsedType = value.vectorType;
    return `<${parsedType as string}>[...]`;
  }
  return parsedValue;
}

/**
 * Parse a deploy argument.
 *
 * @param arg - A CLValue argument from a deploy.
 * @returns Parsed argument to a human-readable string.
 */
function parseDeployArg(arg: unknown): string | any[] {
  const tag = (arg as CLValue).type.getTypeID();
  switch (tag) {
    case TypeID.Unit:
      return String('CLValue Unit');

    case TypeID.Key:
      return (arg as Key).toString();

    case TypeID.URef:
      return (arg as URef).toString();

    case TypeID.Option:
      const option = arg as CLValue;
      if (!option.option?.isEmpty()) {
        return parseDeployArg(option.option?.value());
      }
      return `${option.toString()} ${option.type?.toString() ?? ''}`;

    case TypeID.List:
      return (arg as CLValueList).elements.map((member: any) =>
        sanitiseNestedLists(member),
      );

    case TypeID.ByteArray:
      return (arg as CLValueByteArray).toString();

    case TypeID.Result:
      const result = arg as CLValueResult;
      const status = result.isSuccess ? 'OK:' : 'ERR:';
      const parsed = parseDeployArg(result.value());
      return `${status} ${parsed as string}`;

    case TypeID.Map:
      const map = (arg as CLValueMap).getMap();
      let mapParsedString = '';
      for (const [key, value] of Object.entries(map)) {
        mapParsedString += `${key}=${parseDeployArg(value) as string}`;
      }
      return mapParsedString;

    case TypeID.Tuple1:
      return parseDeployArg((arg as CLValueTuple1).value());

    case TypeID.Tuple2:
      return (arg as CLValueTuple2)
        .value()
        .map((member: any) => sanitiseNestedLists(member));

    case TypeID.Tuple3:
      return (arg as CLValueTuple3)
        .value()
        .map((member: any) => sanitiseNestedLists(member));

    case TypeID.PublicKey:
      return (arg as CLValue).publicKey?.toHex() ?? '';

    default:
      // Special handling as there is no TypeID for CLAccountHash
      if (arg instanceof AccountHash) {
        return arg.toPrefixedString();
      }
      return (arg as CLValue).toString();
  }
}

/**
 * Parse a transfer deploy.
 *
 * @param transferDeploy - A transfer deploy from the casper js sdk.
 * @returns An object formatted for Metamask Casper Snap.
 */
function parseTransferData(
  transferDeploy: TransferDeployItem,
): Record<string, unknown> {
  const transferArgs = {} as any;

  // Target can either be a hex formatted public key or an account hash

  transferArgs.Recipient = transferDeploy.args.args.get('target')?.toString();

  const amount = transferDeploy?.args.args.get('amount')?.toString() ?? '';

  const id = transferDeploy?.args.args.get('id')?.toString();

  transferArgs.Amount = `${convertMotesToCasper(amount)} CSPR`;
  transferArgs.Motes = `${amount.toString()}`;
  transferArgs['Transfer ID'] = id;

  return transferArgs;
}

/**
 * Convert motes to casper.
 *
 * @param motesAmount - Amount in motes.
 * @returns Amount in string.
 */
function convertMotesToCasper(motesAmount: string) {
  try {
    return FixedNumber.from(motesAmount)
      .divUnsafe(FixedNumber.from(1000000000))
      .toString();
  } catch (error) {
    console.log(error);
    return '0';
  }
}

/**
 * Parse a transaction into an object.
 *
 * @param transaction - Transaction from the Casper JS SDK.
 * @param signingKey - Signing Key in the Hex format.
 * @returns Object - Will be used to display information to the user in metamask.
 */
export function transactionToObject(
  transaction: Transaction,
  signingKey: string,
) {
  const deployAccount = transaction.initiatorAddr.publicKey
    ? transaction.initiatorAddr.publicKey.toHex()
    : transaction.initiatorAddr.accountHash?.toHex();

  let type;

  const deploy = transaction.getDeploy();
  const transactionV1 = transaction.getTransactionV1();
  if (deploy) {
    if (deploy.isTransfer()) {
      type = 'Transfer';
    } else if (deploy.session.isModuleBytes()) {
      type = 'WASM-Based Deploy';
    } else if (
      deploy.session.isStoredContractByHash() ||
      deploy.session.isStoredContractByName()
    ) {
      type = 'Contract Call';
    } else {
      type = 'Contract Package Call';
    }
    let deployArgs = {} as any;
    if (deploy.session.transfer) {
      deployArgs = parseTransferData(deploy.session.transfer);
    } else if (deploy.session.moduleBytes) {
      deploy.session.moduleBytes.args.args.forEach((argument, key) => {
        deployArgs[key] = parseDeployArg(argument);
      });
    } else {
      let storedContract;
      if (deploy.session.storedContractByHash) {
        storedContract = deploy.session.storedContractByHash;
      } else if (deploy.session.storedContractByName) {
        storedContract = deploy.session.storedContractByName;
      } else if (deploy.session.storedVersionedContractByHash) {
        storedContract = deploy.session.storedVersionedContractByHash;
      } else if (deploy.session.storedVersionedContractByName) {
        storedContract = deploy.session.storedVersionedContractByName;
      } else {
        throw new Error(`Stored Contract could not be parsed.\n\
          Provided session code: ${deploy.session.bytes().toString()}`);
      }

      storedContract.args.args.forEach((argument, key) => {
        deployArgs[key] = parseDeployArg(argument);
      });
      deployArgs['Entry Point'] = storedContract.entryPoint;
    }
    return {
      deployHash: transaction.hash.toHex(),
      signingKey,
      account: deployAccount,
      bodyHash: deploy.header.bodyHash?.toHex(),
      chainName: transaction.chainName,
      timestamp: new Date(transaction.timestamp.date).toLocaleString(),
      gasPrice: deploy.header.gasPrice.toString(),
      deployType: type,
      deployArgs,
    };
  } else if (transactionV1) {
    const deployArgs = {} as any;
    transaction.args.args.forEach((argument, key) => {
      deployArgs[key] = parseDeployArg(argument);
    });
    return {
      deployHash: transaction.hash.toHex(),
      signingKey,
      account: deployAccount,
      bodyHash: Conversions.encodeBase16(transaction.entryPoint.toBytes()),
      chainName: transaction.chainName,
      timestamp: new Date(transaction.timestamp.date).toLocaleString(),
      deployType:
        transaction.entryPoint.customEntryPoint ?? transaction.entryPoint.type,
      deployArgs,
    };
  }
  throw new Error('Unsupported transaction type');
}

/**
 * Add a signature to a deploy and validate it.
 *
 * @param transaction - Transaction object.
 * @param signature - Signature bytes.
 * @param publicKeyHex - Public key hex string.
 * @returns Object - Either an object containing the deploy or an error.
 */
export function addSignatureAndValidateTransaction(
  transaction: Transaction,
  signature: Uint8Array,
  publicKeyHex: string,
) {
  transaction.setSignature(signature, PublicKey.fromHex(publicKeyHex));

  if (transaction.validate()) {
    return { deploy: Transaction.toJSON(transaction) };
  }
  return { error: 'Unable to verify deploy after signature.' };
}

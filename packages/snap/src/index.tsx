import { getBIP44AddressKeyDeriver } from '@metamask/key-tree';
import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';
import type { SnapComponent } from '@metamask/snaps-sdk/jsx';
import { Box, Copyable, Heading, Row, Text } from '@metamask/snaps-sdk/jsx';
import { PublicKey, Transaction } from 'casper-js-sdk';
import { ecdsaSign } from 'ethereum-cryptography/secp256k1-compat';
import { sha256 } from 'ethereum-cryptography/sha256';
import * as nacl from 'tweetnacl-ts';

import {
  addSignatureAndValidateTransaction,
  transactionToObject,
} from './utils';

/* eslint-disable no-restricted-globals */

/**
 * Get casper address.
 *
 * @param addressIndex - Address index.
 * @returns The public key hex of the user.
 */
async function getCSPRAddress(addressIndex = 0) {
  const bip44Node = await snap.request({
    method: 'snap_getBip44Entropy',
    params: {
      coinType: 506,
    },
  });
  const bip44Nodeaddr = await getBIP44AddressKeyDeriver(bip44Node);
  const addressKey = await bip44Nodeaddr(addressIndex);
  try {
    return {
      publicKey: PublicKey.fromBytes(
        Buffer.from(`02${addressKey.compressedPublicKey.slice(2)}`, 'hex'),
      ).result.toHex(),
    };
  } catch (error: any) {
    return {
      error: `${error as string} Unsupported curve. Received ${
        addressKey.curve
      }. ${addressKey.compressedPublicKeyBytes.length} ${
        addressKey.publicKey
      } ${addressKey.compressedPublicKey.slice(
        2,
      )} Only Secp256K1 && Ed25519 are supported.`,
    };
  }
}

type PaymentProps = {
  transaction: Transaction;
};

const Payment: SnapComponent<PaymentProps> = ({ transaction }) => {
  if (transaction.pricingMode.paymentLimited) {
    return (
      <Box>
        <Row label="Payment Type">
          <Text>Limited</Text>
        </Row>
        <Row label="Gas price tolerance">
          <Text>
            {transaction.pricingMode.paymentLimited.gasPriceTolerance.toFixed(
              0,
            )}
          </Text>
        </Row>
        <Row label="Payment Amount">
          <Text>
            {transaction.pricingMode.paymentLimited.paymentAmount.toFixed(0)}
          </Text>
        </Row>
      </Box>
    );
  }
  if (transaction.pricingMode.fixed) {
    return (
      <Box>
        <Row label="Payment Type">
          <Text>Fixed</Text>
        </Row>
        <Row label="Gas price tolerance">
          <Text>
            {transaction.pricingMode.fixed.gasPriceTolerance.toFixed(0)}
          </Text>
        </Row>
        <Row label="Additional Computation Power">
          <Text>
            {transaction.pricingMode.fixed.additionalComputationFactor.toFixed(
              0,
            )}
          </Text>
        </Row>
      </Box>
    );
  }
  if (transaction.pricingMode.prepaid) {
    return (
      <Box>
        <Row label="Payment Type">
          <Text>Prepaid</Text>
        </Row>
        <Row label="Receipt">
          <Text>{transaction.pricingMode.prepaid?.receipt.toHex()}</Text>
        </Row>
      </Box>
    );
  }

  return (
    <Row label="Payment Type">
      <Text>Not supported</Text>
    </Row>
  );
};

/**
 * Displays a prompt to the user in the MetaMask UI.
 *
 * @param transaction - Transaction object that will be parsed to display the content of if.
 * @param signingKey - Hex encoded public key address.
 * @param origin - Origin of the request.
 * @returns `true` if the user accepted the confirmation,
 * and `false` otherwise.
 */
async function promptUserDeployInfo(
  transaction: Transaction,
  signingKey: string,
  origin: string,
) {
  const deployInfo = transactionToObject(transaction, signingKey);
  return await snap.request({
    method: 'snap_dialog',
    params: {
      type: 'confirmation',
      content: (
        <Box>
          <Heading>Sign {deployInfo.deployType}</Heading>
          <Row label="Request origin">
            <Text>{origin}</Text>
          </Row>
          <Row label="Deploy Hash">
            <Text>{deployInfo.deployHash}</Text>
          </Row>
          <Row label="Signing Key">
            <Text>{deployInfo.signingKey}</Text>
          </Row>
          <Row label="Account">
            <Text>{deployInfo.account ?? ''}</Text>
          </Row>
          <Row label="Body Hash">
            <Text>{deployInfo.bodyHash ?? ''}</Text>
          </Row>
          <Row label="Chain Name">
            <Text>{deployInfo.chainName}</Text>
          </Row>
          <Row label="Timestamp">
            <Text>{deployInfo.timestamp}</Text>
          </Row>
          <Payment transaction={transaction} />
          <Heading>Deploy arguments</Heading>
          {Object.entries(deployInfo.deployArgs).map((arg: any) => (
            <Row label={arg[0]}>
              {Array.isArray(arg[1]) ? (
                arg[1].map((v: any) => <Text>{v}</Text>)
              ) : (
                <Text>{arg[1]}</Text>
              )}
            </Row>
          ))}
        </Box>
      ),
    },
  });
}

/**
 * Sign a deploy.
 *
 * @param deployJson - JSON formatted deploy.
 * @param origin - Origin of the request.
 * @param addressIndex - Address index.
 */
async function sign(deployJson: object, origin: string, addressIndex = 0) {
  const publicKeyHex = (await getCSPRAddress(addressIndex)).publicKey;
  if (!publicKeyHex) {
    return { error: `Unable to get public key at index ${addressIndex}.` };
  }
  try {
    const transaction = Transaction.fromJson(deployJson);
    const deployHash = transaction.hash.toHex();
    const bip44Node = await snap.request({
      method: 'snap_getBip44Entropy',
      params: {
        coinType: 506,
      },
    });
    const message = Buffer.from(deployHash, 'hex');
    const bip44Nodeaddr = await getBIP44AddressKeyDeriver(bip44Node);
    const addressKey = await bip44Nodeaddr(addressIndex);
    const response = await promptUserDeployInfo(
      transaction,
      publicKeyHex,
      origin,
    );
    if (!response) {
      return false;
    }

    if (addressKey.privateKeyBytes) {
      if (addressKey.curve === 'ed25519') {
        const signature = Buffer.from(
          nacl.sign_detached(message, addressKey.privateKeyBytes),
        );
        return addSignatureAndValidateTransaction(
          transaction,
          signature,
          publicKeyHex,
        );
      }

      if (addressKey.curve === 'secp256k1') {
        const res = ecdsaSign(
          sha256(Buffer.from(message)),
          addressKey.privateKeyBytes,
        );
        const signature = Buffer.from(res.signature);
        return addSignatureAndValidateTransaction(
          transaction,
          signature,
          publicKeyHex,
        );
      }
      return {
        error: `Unsupported curve : ${addressKey.curve}. Only Secp256K1 && Ed25519 are supported.`,
      };
    }
  } catch (error) {
    return {
      error: `${JSON.stringify(
        error,
      )} ${error} Unable to convert json into deploy object.`,
    };
  }

  return {
    error: `No private key associated with the account ${addressIndex}.`,
  };
}

/**
 * Sign a message.
 *
 * @param message - Message.
 * @param origin - Origin of the request.
 * @param addressIndex - Address index.
 */
async function signMessage(message: string, origin: string, addressIndex = 0) {
  const bip44Node = await snap.request({
    method: 'snap_getBip44Entropy',
    params: {
      coinType: 506,
    },
  });
  const bip44Nodeaddr = await getBIP44AddressKeyDeriver(bip44Node);
  const addressKey = await bip44Nodeaddr(addressIndex);
  const messageBytes = Uint8Array.from(
    Buffer.from(`Casper Message:\n${message}`),
  );
  const publicKeyHex = (await getCSPRAddress(addressIndex)).publicKey;
  const response = await snap.request({
    method: 'snap_dialog',
    params: {
      type: 'confirmation',
      content: (
        <Box>
          <Heading>Sign message</Heading>
          <Row label="Request origin">
            <Copyable value={origin}></Copyable>
          </Row>
          <Row label="Signing Key">
            <Copyable value={publicKeyHex ?? ''}></Copyable>
          </Row>
          <Row label="Message">
            <Copyable value={message}></Copyable>
          </Row>
        </Box>
      ),
    },
  });

  if (!response) {
    return false;
  }

  if (addressKey.privateKeyBytes) {
    if (addressKey.curve === 'ed25519') {
      return {
        signature: Buffer.from(
          nacl.sign_detached(messageBytes, addressKey.privateKeyBytes),
        ).toString('hex'),
      };
    }

    if (addressKey.curve === 'secp256k1') {
      const res = ecdsaSign(sha256(messageBytes), addressKey.privateKeyBytes);
      return { signature: Buffer.from(res.signature).toString('hex') };
    }
    return {
      error: `Unsupported curve : ${addressKey.curve}. Only Secp256K1 && Ed25519 are supported.`,
    };
  }
  return { error: 'No private key associated with the account.' };
}

/**
 * Handle incoming JSON-RPC requests, sent through `wallet_invokeSnap`.
 *
 * @param args - The request handler args as object.
 * @param args.origin - The origin of the request, e.g., the website that
 * invoked the snap.
 * @param args.request - A validated JSON-RPC request object.
 * @returns The result of `snap_dialog`.
 * @throws If the request method is not valid for this snap.
 */
export const onRpcRequest: OnRpcRequestHandler = async ({
  origin,
  request,
}) => {
  switch (request.method) {
    case 'casper_getAccount':
      return getCSPRAddress(request?.params?.addressIndex);
    case 'casper_sign':
      return sign(
        request?.params?.deployJson,
        origin,
        request?.params?.addressIndex,
      );
    case 'casper_signMessage':
      return signMessage(
        request?.params?.message,
        origin,
        request?.params?.addressIndex,
      );
    default:
      throw new Error('Method not found.');
  }
};

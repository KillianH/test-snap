import { getBIP44AddressKeyDeriver } from '@metamask/key-tree';
import type { OnRpcRequestHandler } from '@metamask/snaps-sdk';
import { Box, Text, Bold } from '@metamask/snaps-sdk/jsx';
import { PublicKey } from 'casper-js-sdk';

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
        addressKey.compressedPublicKeyBytes,
      ).result.toHex(),
    };
  } catch {
    return {
      error: `Unsupported curve. Received ${addressKey.curve}. Only Secp256K1 && Ed25519 are supported.`,
    };
  }
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
      return getCSPRAddress();
    case 'hello':
      return snap.request({
        method: 'snap_dialog',
        params: {
          type: 'confirmation',
          content: (
            <Box>
              <Text>
                Hello, <Bold>{origin}</Bold>!
              </Text>
              <Text>
                This custom confirmation is just for display purposes.
              </Text>
              <Text>
                But you can edit the snap source code to make it do something,
                if you want to!
              </Text>
            </Box>
          ),
        },
      });
    default:
      throw new Error('Method not found.');
  }
};

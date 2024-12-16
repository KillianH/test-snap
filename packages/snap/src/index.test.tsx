import { expect } from '@jest/globals';
import { installSnap } from '@metamask/snaps-jest';

describe('onRpcRequest', () => {
  it('throws an error if the requested method does not exist', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'foo',
    });

    expect(response).toRespondWithError({
      code: -32603,
      message: 'Method not found.',
      stack: expect.any(String),
    });
  });
  it('get cspr account', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'casper_getAccount',
    });
    expect(response).toRespondWith({
      publicKey:
        '02025e3cc431e77e52e39e590af36a5dcb7e6ef1e22af86bfd8f022eeea8fccb6740',
    });
  });
  it('get cspr account derived 1', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'casper_getAccount',
      params: {
        addressIndex: 1,
      },
    });
    expect(response).toRespondWith({
      publicKey:
        '02025f8aa8213534eb9acc9cbd3d464cd4990e4dd90f1e6a957cddedfc3b5d21ca42',
    });
  });
  it('get cspr account derived -1', async () => {
    const { request } = await installSnap();

    const response = await request({
      method: 'casper_getAccount',
      params: {
        addressIndex: -1,
      },
    });
    expect(response).toRespondWithError({
      code: -32603,
      message: 'Invalid BIP-32 index: Must be a non-negative integer.',
      stack: expect.any(String),
    });
  });
});

import { WalletContractV5R1 } from '@ton/ton';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';

export const createTonWallet = async () => {
    const mnemonic = await mnemonicNew();
    const keyPair = await mnemonicToPrivateKey(mnemonic);

    const walletContract = WalletContractV5R1.create({
        workchain: 0,
        publicKey: keyPair.publicKey,
    });

    return {
        mnemonic: mnemonic.join(' '),
        address: walletContract.address.toString(),
        privateKey: keyPair.secretKey.toString('hex'),
    };
};

export const getPublicKeyHex = async (mnemonic: string[]) => {
    return (await mnemonicToPrivateKey(mnemonic)).publicKey.toString('hex');
};

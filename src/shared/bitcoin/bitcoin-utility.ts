import * as bitcoin from 'bitcoinjs-lib';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as bip39 from 'bip39';
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
import * as bip32 from 'bip32';

export class BitcoinUtility {
    createWallet() {
        const mnemonic = bip39.generateMnemonic();

        const seed = bip39.mnemonicToSeedSync(mnemonic);

        const root = bip32.fromSeed(seed);

        const account = root.derivePath("m/84'/0'/0'/0/0");

        const { address } = bitcoin.payments.p2wpkh({ pubkey: account.publicKey });
        if (!address) {
            throw new Error('Не удалось создать bitcoin кошелек');
        }

        return {
            mnemonic,
            address,
        };
    }
}

export const bitcoinUtility = new BitcoinUtility();

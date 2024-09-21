import { Api, TonApiClient } from '@ton-api/client';
import { ContractAdapter } from '@ton-api/ton-adapter';
import { mnemonicNew, mnemonicToPrivateKey } from '@ton/crypto';
import { MessageRelaxed, SendMode, StateInit, WalletContractV5R1, beginCell, storeStateInit } from '@ton/ton';
import { APP_CONFIG } from '../../config';
import { WalletV5R1SendArgs } from '@ton/ton/dist/wallets/WalletContractV5R1';

type TSendTxArgs = WalletV5R1SendArgs & {
    messages: MessageRelaxed[];
    sendMode: SendMode;
};

export class TonUtility {
    client = new Api(
        new TonApiClient({
            baseUrl: 'https://tonapi.io',
            apiKey: APP_CONFIG.TON_API_KEY,
        })
    );

    async createWallet() {
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
    }

    async getPublicKeyHex(mnemonic: string[]) {
        return (await mnemonicToPrivateKey(mnemonic)).publicKey.toString('hex');
    }

    async getWalletContract(mnemonic: string[]) {
        return WalletContractV5R1.create({
            workchain: 0,
            publicKey: (await this.getKeyPair(mnemonic)).publicKey,
        });
    }

    async getWalletAddress(mnemonic: string[]) {
        const wallet = WalletContractV5R1.create({
            workchain: 0,
            publicKey: (await this.getKeyPair(mnemonic)).publicKey,
        });

        return wallet.address.toString();
    }

    packStateInit(init: StateInit) {
        return beginCell().store(storeStateInit(init)).endCell().toBoc().toString('base64');
    }

    get contractAdapter() {
        return new ContractAdapter(this.client);
    }

    getKeyPair(mnemonic: string[]) {
        return mnemonicToPrivateKey(mnemonic);
    }

    async getBalanceByMnemonic(mnemonic: string[]) {
        const wallet = await this.getWalletContract(mnemonic);
        const contract = this.contractAdapter.open(wallet);
        return contract.getBalance();
    }

    async sendTransaction(mnemonic: string[], options: Omit<TSendTxArgs, 'secretKey' | 'seqno'>) {
        const adapter = new ContractAdapter(this.client);

        const keyPair = await this.getKeyPair(mnemonic);
        const wallet = await this.getWalletContract(mnemonic);

        const contract = adapter.open(wallet);

        // eslint-disable-next-line @typescript-eslint/ban-ts-comment
        // @ts-expect-error
        return contract.sendTransfer({
            ...options,
            secretKey: keyPair.secretKey,
            seqno: await contract.getSeqno(),
        });
    }
}
export const tonUtility = new TonUtility();

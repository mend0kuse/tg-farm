import { GetAssetInfoParamsV5, GetWalletBalanceParamsV5, RestClientV5, WithdrawParamsV5 } from 'bybit-api';
import { APP_CONFIG } from '../../config';
import { baseLogger } from '../logger';
import { TOKEN, CHAIN } from '../tokens';

export class ByBitApi {
    private client = new RestClientV5({
        testnet: !APP_CONFIG.BYBIT_IS_MAINNET,
        key: APP_CONFIG.BYBIT_KEY,
        secret: APP_CONFIG.BYBIT_SECRET,
    });

    async withdrawToken({
        addresses,
        chain,
        token,
        timestamp = new Date().getTime(),
        ...params
    }: Omit<WithdrawParamsV5, 'address' | 'chain' | 'coin' | 'timestamp'> & {
        addresses: string[];
        token: TOKEN;
        chain: CHAIN;
        timestamp?: number;
    }) {
        for (const address of addresses) {
            try {
                const response = await this.client.submitWithdrawal({
                    ...params,
                    address,
                    coin: token,
                    chain,
                    timestamp,
                });

                console.log(response);

                if (response.retMsg !== 'success') {
                    throw new Error(response.retMsg);
                }

                baseLogger.log(`Результат отправки ${token} на адрес ${address}: `, response.retMsg);
            } catch (error) {
                baseLogger.error(`Ошибка отправки ${token} на адрес ${address}`, error);
            }
        }
    }

    async getBalance(params: GetWalletBalanceParamsV5) {
        return this.client.getWalletBalance(params);
    }

    async getAssetInfo(params: GetAssetInfoParamsV5) {
        return this.client.getAssetInfo(params);
    }

    async getAllCoinsBalance() {
        return (await this.client.getAllCoinsBalance({ accountType: 'FUND' })).result.balance.filter(
            (item) => Number(item.walletBalance) > 0
        );
    }

    async getAccountInfo() {
        return this.client.getAccountInfo();
    }

    async getTokenInfo(token: TOKEN) {
        return this.client.getCoinInfo(token);
    }

    async getWithdrawableAmount(token: TOKEN) {
        return this.client.getWithdrawableAmount({
            coin: token,
        });
    }

    async getServerTime() {
        return this.client.getServerTime();
    }
}

export const bybitApi = new ByBitApi();

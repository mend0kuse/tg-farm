import { RestClientV2 } from 'bitget-api';
import { APP_CONFIG } from '../../config';
import { BaseLogger } from '../logger';
import { TOKEN, CHAIN } from '../tokens';

export class BitgetApi {
    private client = new RestClientV2({
        apiKey: APP_CONFIG.BITGET_KEY,
        apiSecret: APP_CONFIG.BITGET_SECRET,
        apiPass: APP_CONFIG.BITGET_PASSPHRASE,
    });

    private logger = new BaseLogger('BITGET');

    async withdrawToken({
        addresses,
        chain,
        token,
        ...params
    }: {
        addresses: string[];
        token: TOKEN;
        chain: CHAIN;
        timestamp?: number;
        amount: string;
    }) {
        for (const address of addresses) {
            this.logger.log(`Начало отправки на адрес ${address}`);

            try {
                const response = await this.client.spotWithdraw({
                    transferType: 'on_chain',
                    address,
                    coin: token,
                    chain,
                    size: params.amount,
                });

                if (response.code !== '00000') {
                    throw new Error(response.msg);
                }

                this.logger.log(`Результат отправки ${token} на адрес ${address}: `, response.msg);
            } catch (error) {
                this.logger.error(`Ошибка отправки ${token} на адрес ${address}`, error);
            }
        }
    }

    getBalances() {
        return this.client.getBalances();
    }
}

export const bitgetApi = new BitgetApi();

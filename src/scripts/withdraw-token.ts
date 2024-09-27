import { bitgetApi } from '../shared/bitget/bitget-api';
import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { CHAIN, TOKEN } from '../shared/tokens';
import { random, sleep } from '../shared/utils';

(async () => {
    try {
        const users = excelUtility.getAccounts();

        for (const user of users.slice(35, 44)) {
            await sleep(random(10, 20));

            await bitgetApi.withdrawToken({
                addresses: [user.addressTon],
                token: TOKEN.TON,
                chain: CHAIN.TON,
                amount: '0.8',
            });
        }
    } catch (error) {
        baseLogger.error(error);
    }

    process.exit(0);
})();

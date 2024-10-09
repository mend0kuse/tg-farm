import axios from 'axios';
import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { random, sleep } from '../shared/utils';
import { SocksProxyAgent } from 'socks-proxy-agent';

const [, , sessionName] = process.argv;

(async () => {
    const accounts = excelUtility.getAccounts();

    for (const user of accounts) {
        if (sessionName && user.index !== Number(sessionName)) {
            continue;
        }

        if (!user.proxy) {
            baseLogger.error(`Не найден прокси для сессии ${user.index}`);
            process.exit(1);
        }

        await sleep(random(1, 2));

        try {
            const agent = new SocksProxyAgent(user.proxy);

            const { data } = await axios.get('https://ifconfig.me/ip', {
                httpAgent: agent,
                httpsAgent: agent,
            });

            baseLogger.log('#', user.index + ' ', data);
        } catch (err) {
            baseLogger.error(`Ошибка ${user.index}`, err);
        }
    }

    process.exit(0);
})();

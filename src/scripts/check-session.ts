import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from '../shared/utils';

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
            const { telegramClient } = await telegramApi.createClientBySession({
                sessionName: user.index.toString(),
                proxy: parseSocks5Proxy(user.proxy),
            });

            await telegramClient.close();
            baseLogger.log('Успешно ', user.index);
        } catch (err) {
            baseLogger.error(`Ошибка ${user.index}`, err);
        }
    }

    process.exit(0);
})();

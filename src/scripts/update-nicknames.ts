import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from '../shared/utils';

(async () => {
    const users = excelUtility.getAccounts();

    for (const user of users) {
        try {
            const { telegramClient } = await telegramApi.createClientBySession({
                proxy: parseSocks5Proxy(user.proxy),
                sessionName: user.index.toString(),
            });

            await sleep(random(10, 20));

            await telegramApi.updateProfile(telegramClient, {
                firstName: user.username,
                lastName: '',
            });
        } catch (error) {
            baseLogger.error(`Ошибка при изменении профиля ${user.index}:`, error);
        }
    }
})();

import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy } from '../shared/utils';

const [, , sessionName] = process.argv;

(async () => {
    const accounts = excelUtility.getAccounts();

    const { proxy } = accounts.find((acc) => acc.index === Number(sessionName)) ?? {};

    const { telegramClient } = await telegramApi.createClientBySession({
        sessionName,
        proxy: parseSocks5Proxy(proxy ?? ''),
    });

    const me = await telegramClient.getMe();
    baseLogger.log(me);

    process.exit(0);
})();

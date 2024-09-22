import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy } from '../shared/utils';

const [, , sessionName, proxy] = process.argv;

(async () => {
    const { sessionResult, telegramClient } = await telegramApi.createClientBySession({
        sessionName,
        proxy: parseSocks5Proxy(proxy),
    });

    baseLogger.log(sessionResult);
    await telegramClient.close();
})();

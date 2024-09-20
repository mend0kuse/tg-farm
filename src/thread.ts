import { workerData, parentPort } from 'worker_threads';
import { TAccountData } from './accounts-generator';
import { baseLogger } from './shared/logger';
import { telegramApi } from './shared/telegram/telegram-api';
import { parseSocks5Proxy } from './shared/utils';
import { XEmpire } from './xempire/xempire';
import { Xrum } from './xrum/xrum';

const user = workerData as TAccountData & { refCode: string };

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    const { telegramClient } = await telegramApi.createClientBySession({
        session: user.session,
        proxy: parseSocks5Proxy(user.proxy),
        sessionName: user.index.toString(),
    });

    try {
        await Promise.allSettled([
            new XEmpire({
                telegramClient,
                index: user.index,
                ua: user.userAgent,
                proxy: user.proxy,
                mnemonic: user.mnemonicTon,
                refCode: user.refCode,
            }).start(),

            new Xrum({ account: user, refCode: user.refCode, telegramClient }).start(),
        ]);

        parentPort?.postMessage(`Воркер ${user.index} окончен`);
    } catch (error) {
        baseLogger.error(error);
    }
})();

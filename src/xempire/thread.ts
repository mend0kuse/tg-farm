import { workerData, parentPort } from 'worker_threads';
import { baseLogger } from '../shared/logger';
import { createTelegramClientBySession } from '../shared/telegram/client';
import { parseSocks5Proxy } from '../shared/utils';
import { XEmpire } from './xempire';
import { TAccountData } from '../accounts-generator';

const user = workerData as TAccountData & { refCode: string };

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    const { telegramClient } = await createTelegramClientBySession({
        session: user.session,
        proxy: parseSocks5Proxy(user.proxy),
        sessionName: user.index.toString(),
    });

    try {
        await new XEmpire({
            telegramClient,
            index: user.index,
            ua: user.userAgent,
            proxy: user.proxy,
            mnemonic: user.mnemonicTon,
            refCode: user.refCode,
        }).start();

        parentPort?.postMessage(`Воркер ${user.index} окончен`);
    } catch (error) {
        baseLogger.error(`X_CRASH_${user.index}`, error);
    }
})();

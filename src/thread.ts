import { workerData } from 'worker_threads';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { runCatsWorker } from './cats/worker';
import { runHrumWorker } from './xrum/worker';
import { runPixelWorker } from './pixel/worker';
import { runVanaWorker } from './vana/worker';
import { runEmpireWorker } from './xempire/worker';
import { telegramApi } from './shared/telegram/telegram-api';
import { parseSocks5Proxy } from './shared/utils';

const user = workerData as TAccountData;

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    const { telegramClient } = await telegramApi.createClientBySession({
        proxy: parseSocks5Proxy(user.proxy),
        sessionName: user.index.toString(),
    });

    await Promise.allSettled([
        runHrumWorker(user, telegramClient),
        runPixelWorker(user, telegramClient),
        runEmpireWorker(user, telegramClient),
        runCatsWorker(user, telegramClient),
        runVanaWorker(user, telegramClient),
    ]);
})();

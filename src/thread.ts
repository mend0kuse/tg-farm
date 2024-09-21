import { workerData } from 'worker_threads';
import { TAccountData } from './accounts-generator';
import { baseLogger } from './shared/logger';
import { telegramApi } from './shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from './shared/utils';
import { XEmpire } from './xempire/xempire';
import { runEmpireWorker } from './xempire/worker';

const user = workerData as TAccountData & { refCode: string };

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    await Promise.allSettled([runEmpireWorker(user)]);
})();

import { workerData } from 'worker_threads';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { runCatsWorker } from './cats/worker';
import { runHrumWorker } from './xrum/worker';
import { runPixelWorker } from './pixel/worker';
import { runEmpireWorker } from './xempire/worker';
import { telegramApi } from './shared/telegram/telegram-api';
import { parseSocks5Proxy } from './shared/utils';
import { runDropsWorker } from './drops/worker';
import { runBitcoinTapWorker } from './bitcoin-tap/worker';
import { runVanaWorker } from './vana/worker';
import { runBlumWorker } from './blum/worker';

const user = workerData as TAccountData;

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    try {
        const { telegramClient } = await telegramApi.createClientBySession({
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        // Чтобы выключить бота - закомментируйте или удалите строчку

        await Promise.allSettled([
            runHrumWorker(user, telegramClient), // xrum
            runPixelWorker(user, telegramClient), // not pixel
            runEmpireWorker(user, telegramClient), // xempire
            runCatsWorker(user, telegramClient), // cats
            runVanaWorker(user, telegramClient), // vana
            runDropsWorker(user, telegramClient), // drops
            runBitcoinTapWorker(user, telegramClient), // bitcoin-tap
            runBlumWorker(user, telegramClient), // blum
        ]);
    } catch (error) {
        baseLogger.error(`Ошибка воркера ${user.index}:`, error);
        await telegramApi.sendBotNotification(`Не удалось создать телеграм клиент ${user.index}. ${error}`);
    }
})();

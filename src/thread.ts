import { workerData } from 'worker_threads';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { runCatsWorker } from './cats/worker';
import { runHrumWorker } from './xrum/worker';
import { runPixelWorker } from './pixel/worker';
import { runVanaWorker } from './vana/worker';
import { runEmpireWorker } from './xempire/worker';

const user = workerData as TAccountData;

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    await Promise.allSettled([
        runHrumWorker(user),
        runPixelWorker(user),
        runEmpireWorker(user),
        runCatsWorker(user),
        runVanaWorker(user),
    ]);
})();

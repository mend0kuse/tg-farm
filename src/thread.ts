import { workerData } from 'worker_threads';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { runHrumWorker } from './xrum/worker';

const user = workerData as TAccountData;

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    await Promise.allSettled([
        // runEmpireWorker(user),
        runHrumWorker(user),
        // runCatsWorker(user)
    ]);
})();

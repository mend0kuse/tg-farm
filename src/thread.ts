import { workerData } from 'worker_threads';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { runCatsWorker } from './cats/worker';
import { runHrumWorker } from './xrum/worker';

const user = workerData as TAccountData;

(async () => {
    baseLogger.log(`Воркер ${user.index} Старт`);

    await Promise.allSettled([runHrumWorker(user), runCatsWorker(user)]);
})();

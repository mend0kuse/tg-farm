import { workerData } from 'worker_threads';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { mongoDatabase } from './shared/database/mongodb';
import { runHrumWorker } from './xrum/worker';
import { runEmpireWorker } from './xempire/worker';

const user = workerData as TAccountData;

(async () => {
    await mongoDatabase.connect();

    baseLogger.log(`Воркер ${user.index} Старт`);

    await Promise.allSettled([runEmpireWorker(user), runHrumWorker(user)]);

    await mongoDatabase.close();
})();

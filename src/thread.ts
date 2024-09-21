import { workerData } from 'worker_threads';
import { TAccountData } from './accounts-generator';
import { baseLogger } from './shared/logger';
import { runEmpireWorker } from './xempire/worker';
import { mongoDatabase } from './shared/database/mongodb';

const user = workerData as TAccountData & { refCode: string };

(async () => {
    await mongoDatabase.connect();

    baseLogger.log(`Воркер ${user.index} Старт`);

    await Promise.allSettled([runEmpireWorker(user)]);

    await mongoDatabase.close();
})();

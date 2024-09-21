import { excelUtility } from './shared/excel/excel';
import path from 'path';
import { fileURLToPath } from 'url';
import { TAccountData } from './accounts-generator';
import { baseLogger } from './shared/logger';
import { Worker } from 'worker_threads';
import { REFERRAL_MAP as REFERRAL_SYSTEM } from './xempire/constants';
import { APP_CONFIG } from './config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const users = excelUtility.getAccounts(path.join(__dirname, '..', '..', 'accounts.xlsx'));

const getRefByIndex = (index: number) => {
    const inv = REFERRAL_SYSTEM[index];
    const res = inv === 1 ? APP_CONFIG.MASTER_USER_ID : users.find((user) => user.index === index)?.id;
    return res ? `hero${res}` : null;
};

async function createUserThread(user: TAccountData) {
    return new Promise((resolve, reject) => {
        const refCode = getRefByIndex(user.index);

        const worker = new Worker(path.join(__dirname, 'thread'), {
            workerData: { ...user, refCode: refCode ?? '' },
        });

        worker.on('message', resolve);
        worker.on('error', (err) => {
            baseLogger.error('Worker error:', err);
            reject(err);
        });
        worker.on('exit', (code) => {
            if (code !== 0) reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}

async function start() {
    try {
        await Promise.allSettled(users.map((user) => createUserThread(user)));

        baseLogger.error('Выполнено: ', users.length);
    } catch (error) {
        baseLogger.error('Ошибка: ', error);
    }
}

start();

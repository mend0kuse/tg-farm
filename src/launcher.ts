import { excelUtility } from './shared/excel/excel';
import path from 'path';
import { fileURLToPath } from 'url';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { Worker } from 'worker_threads';
import { shuffleArray } from './shared/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const users = excelUtility.getAccounts(path.join(__dirname, '..', 'accounts.xlsx'));

async function createUserThread(user: TAccountData) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'thread'), {
            workerData: user,
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
        shuffleArray(users);

        await Promise.allSettled(users.map((user) => createUserThread(user)));

        baseLogger.error('Выполнено: ', users.length);
    } catch (error) {
        baseLogger.error('Ошибка: ', error);
    }
}

start();

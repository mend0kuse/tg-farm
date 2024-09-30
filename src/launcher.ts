import { excelUtility } from './shared/excel/excel';
import path from 'path';
import { TAccountData } from './scripts/accounts-generator';
import { baseLogger } from './shared/logger';
import { Worker } from 'worker_threads';
import { shuffleArray } from './shared/utils';
import { fileURLToPath } from 'url';

const users = excelUtility.getAccounts();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function createUserThread(user: TAccountData) {
    return new Promise((resolve, reject) => {
        const worker = new Worker(path.join(__dirname, 'thread'), {
            workerData: user,
        });

        worker.on('message', (msg) => {
            baseLogger.log('Worker msg:', msg);
            resolve(msg);
        });

        worker.on('error', (err) => {
            baseLogger.error('Worker error:', err);
            reject(err);
        });

        worker.on('exit', (code) => {
            reject(new Error(`Worker stopped with exit code ${code}`));
        });
    });
}

async function start() {
    try {
        shuffleArray(users);

        await Promise.allSettled(users.map((user) => createUserThread(user)));
    } catch (error) {
        baseLogger.error('Ошибка: ', error);
    }
}

start();

import xlsx from 'xlsx';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { TAccountData } from '../accounts-generator';
import { baseLogger } from '../shared/logger';
import { Worker } from 'worker_threads';
import { REFERRAL_MAP as REFERRAL_SYSTEM } from './constants';
import { APP_CONFIG } from '../config';
import { terminalPrompt } from '../shared/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const users = getUsersFromExcel();

const getRefByIndex = (index: number) => {
    const inv = REFERRAL_SYSTEM[index];
    const res =
        inv === 1 ? APP_CONFIG.MASTER_USER_ID : users.find((user) => user.index === index)?.id;
    return res ? `hero${res}` : null;
};

export function getUsersFromExcel(): TAccountData[] {
    const filePath = path.join(__dirname, '..', '..', 'accounts.xlsx');

    if (!fs.existsSync(filePath)) {
        throw new Error(`Файл не найден по пути: ${filePath}`);
    }

    const workbook = xlsx.readFile(filePath);

    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];

    const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as Array<
        Array<string | number>
    >;

    const headers = jsonData[0] as string[];
    if (!headers) {
        throw new Error('Неправильный формат файла Excel. Проверьте заголовки.');
    }

    const rows = jsonData.slice(1);

    const users: TAccountData[] = rows.map((row) => {
        return {
            index: row[0] as number,
            id: row[1] as number,
            phone: row[2] as string,
            username: row[3] as string,
            session: row[4] as string,
            mnemonicTon: row[5] as string,
            addressTon: row[6] as string,
            proxy: row[7] as string,
            userAgent: row[8] as string,
        };
    });

    return users;
}

async function createUserThread(user: TAccountData) {
    return new Promise((resolve, reject) => {
        const refCode = getRefByIndex(user.index);

        const worker = new Worker(path.join(__dirname, 'thread.ts'), {
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
        const allOrSinge = await terminalPrompt('Индекс для запуска. n если все');
        if (allOrSinge === 'n') {
            await Promise.allSettled(users.map((user) => createUserThread(user)));
        } else {
            const user = users.find((user) => user.index === Number(allOrSinge));
            user && (await createUserThread(user));
        }

        baseLogger.error('Выполнено:', users.length);
    } catch (error) {
        baseLogger.error('Ошибка:', error);
    }
}

start();

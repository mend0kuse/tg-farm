import path from 'path';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { excelUtility } from '../shared/excel/excel';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy } from '../shared/utils';

import fs from 'fs';
import { baseLogger } from '../shared/logger';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const sessionsDir = path.join(__dirname, '..', '..', 'sessions');
const [, , sessionName] = process.argv;

const deleteOldFiles = () => {
    if (fs.existsSync(path.join(sessionsDir, `${sessionName}.session`))) {
        fs.unlinkSync(path.join(sessionsDir, `${sessionName}.session`));
    }
    if (fs.existsSync(path.join(sessionsDir, `${sessionName}.session-wal`))) {
        fs.unlinkSync(path.join(sessionsDir, `${sessionName}.session-wal`));
    }
    if (fs.existsSync(path.join(sessionsDir, `${sessionName}.session-shm`))) {
        fs.unlinkSync(path.join(sessionsDir, `${sessionName}.session-shm`));
    }
};

const updateSessionExcel = (session: string) => {
    const pathToFile = path.join(__dirname, '..', '..', 'accounts.xlsx');

    const workbook = xlsx.readFile(pathToFile);

    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];

    const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

    const acc = jsonData.find((acc) => acc[0] == sessionName);
    acc[4] = session;

    const newWorksheet = xlsx.utils.aoa_to_sheet(jsonData);

    workbook.Sheets[sheetName] = newWorksheet;

    xlsx.writeFile(workbook, pathToFile);
};

(async () => {
    const accounts = excelUtility.getAccounts();

    const proxy = accounts.find((acc) => acc.index === Number(sessionName))?.proxy;

    deleteOldFiles();

    const { sessionResult, telegramClient } = await telegramApi.createClientBySession({
        sessionName,
        proxy: parseSocks5Proxy(proxy ?? ''),
    });

    updateSessionExcel(sessionResult);
    baseLogger.log('Successfully created');
    await telegramClient.close();

    process.exit(0);
})();

import path from 'path';
import fs from 'fs';
import xlsx from 'xlsx';
import { fileURLToPath } from 'url';
import { baseLogger } from '../shared/logger';
import { randomArrayItem } from '../shared/utils';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const proxiesPath = path.join(__dirname, '..', '..', 'proxies.txt');
const accountsPath = path.join(__dirname, '..', '..', 'accounts.xlsx');

const proxies = (() => {
    try {
        const data = fs.readFileSync(proxiesPath, 'utf8');

        baseLogger.log(`Найдено ${data.split('\n').length} прокси`);

        return data.split('\n');
    } catch (err) {
        baseLogger.error('Ошибка при чтении файла proxies:', err);
        process.exit(1);
    }
})();

const workbook = xlsx.readFile(accountsPath);

const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

const newData = jsonData.map((acc, index) => {
    if (index === 0) {
        return acc;
    }

    acc[7] = randomArrayItem(proxies);
    return acc;
});

const newWorksheet = xlsx.utils.aoa_to_sheet(newData);

workbook.Sheets[sheetName] = newWorksheet;

xlsx.writeFile(workbook, accountsPath);

process.exit(0);

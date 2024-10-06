import fs from 'fs';
import xlsx from 'xlsx';
import { TAccountData } from '../../scripts/accounts-generator';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export class ExcelUtility {
    getAccounts(): TAccountData[] {
        const filePath = path.join(__dirname, '..', '..', '..', 'accounts.xlsx');

        if (!fs.existsSync(filePath)) {
            throw new Error(`Файл не найден по пути: ${filePath}`);
        }

        const workbook = xlsx.readFile(filePath);

        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const jsonData = xlsx.utils.sheet_to_json(worksheet, { header: 1 }) as Array<Array<string | number>>;

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
                btcMnemonic: row[9] as string,
                btcAddress: row[10] as string,
            };
        });

        return users;
    }

    getAccountByIndex(index: number) {
        const acc = this.getAccounts().find((acc) => acc.index === index);
        if (!acc) {
            throw new Error(`Аккаунт ${index} не найден`);
        }

        return acc;
    }
}

export const excelUtility = new ExcelUtility();

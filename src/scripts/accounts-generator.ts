import { parseSocks5Proxy, randomArrayItem } from '../shared/utils';
import path from 'path';
import fs from 'fs';
import xlsx from 'xlsx';
import { baseLogger } from '../shared/logger';
import { getRandomAndroidUserAgent } from '../shared/user-agent';
import { fileURLToPath } from 'url';
import { telegramApi } from '../shared/telegram/telegram-api';
import { tonUtility } from '../shared/ton/ton-utility';
import { bitcoinUtility } from '../shared/bitcoin/bitcoin-utility';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const proxiesPath = path.join(__dirname, '..', '..', 'proxies.txt');

const [, , index] = process.argv;

export type TAccountData = {
    index: number;
    id: number;
    phone: string;
    username: string;
    session: string;
    mnemonicTon: string;
    addressTon: string;
    proxy: string;
    userAgent: string;
    btcMnemonic: string;
    btcAddress: string;
};

const proxies = (() => {
    try {
        const data = fs.readFileSync(proxiesPath, 'utf8');

        baseLogger.log(`Найдено ${data.split('\n').length} прокси`);

        return data.split('\n');
    } catch (err) {
        baseLogger.error('Ошибка при чтении файла proxies:', err);
        return [];
    }
})();

const createAccount = async (): Promise<TAccountData> => {
    const proxy = randomArrayItem(proxies.slice(50, -1));

    const { telegramClient, sessionResult } = await telegramApi.createClientBySession({
        proxy: parseSocks5Proxy(proxy ?? ''),
        sessionName: index,
    });

    const me = await telegramClient.getMe();

    const { mnemonic: mnemonicTon, address: addressTon } = await tonUtility.createWallet();
    const { address: btcAddress, mnemonic: btcMnemonic } = bitcoinUtility.createWallet();
    await telegramClient.close();

    return {
        index: Number(index),
        id: Number(me.id),
        phone: me.phoneNumber ?? '',
        username: me.username ?? '',
        session: sessionResult,
        mnemonicTon,
        addressTon,
        proxy,
        userAgent: getRandomAndroidUserAgent(),
        btcMnemonic,
        btcAddress,
    };
};

const processAccounts = async () => {
    const result = await createAccount();

    const pathToFile = path.join(__dirname, '..', '..', 'accounts.xlsx');
    if (fs.existsSync(pathToFile)) {
        const workbook = xlsx.readFile(pathToFile);

        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const jsonData: any[] = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

        jsonData.push(Object.values(result));

        const newWorksheet = xlsx.utils.aoa_to_sheet(jsonData);

        workbook.Sheets[sheetName] = newWorksheet;

        xlsx.writeFile(workbook, pathToFile);

        baseLogger.log('Успешно добавлен');
    } else {
        baseLogger.log('Файл не найден');
    }

    return;
};

processAccounts()
    .then(() => {
        baseLogger.log('Завершено');
        process.exit(0);
    })
    .catch((err) => {
        baseLogger.error(err, 'Ошибка');
        process.exit(1);
    });

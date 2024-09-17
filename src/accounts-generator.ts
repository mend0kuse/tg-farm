import { sleep, random, parseSocks5Proxy, randomArrayItem, terminalPrompt } from './shared/utils';
import path from 'path';
import fs from 'fs';
import xlsx from 'xlsx';
import { baseLogger } from './shared/logger';
import { getRandomAndroidUserAgent } from './shared/user-agent';
import { createTelegramClientBySession as createTelegramClientWithSession } from './shared/telegram/client';
import { createTonWallet } from './shared/ton/wallet';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const proxiesPath = path.join(__dirname, '..', 'proxies.txt');
const GENERATE_USERS_COUNT = Number(await terminalPrompt('Кол-во аккаунтов:'));

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

const createAccount = async (count: number): Promise<TAccountData> => {
    baseLogger.log(`Обработка аккаунта № ${count}`);

    const proxy = randomArrayItem(proxies);
    const index = await terminalPrompt('Индекс аккаунта:');

    const { telegramClient, sessionResult } = await createTelegramClientWithSession({
        proxy: parseSocks5Proxy(proxy ?? ''),
        sessionName: index,
    });

    const me = await telegramClient.getMe();

    const { mnemonic, address } = await createTonWallet();

    return {
        index: Number(index),
        id: Number(me.id),
        phone: me.phoneNumber ?? '',
        username: me.username ?? '',
        session: sessionResult,
        mnemonicTon: mnemonic,
        addressTon: address,
        proxy,
        userAgent: getRandomAndroidUserAgent(),
    };
};

const processAccounts = async () => {
    const results: TAccountData[] = [];

    for (let i = 0; i < GENERATE_USERS_COUNT; i++) {
        if (i !== 0) {
            const delaySeconds = random(5, 10);
            baseLogger.log('Применена задержка... ', delaySeconds);
            await sleep(delaySeconds);
        }

        results.push(await createAccount(i + 1));
    }

    const workBook = xlsx.utils.book_new();

    const workSheet = xlsx.utils.aoa_to_sheet([
        [
            '#',
            'Телеграм id',
            'Телефон',
            'Никнейм',
            'Сессия',
            'Мнемоника ton',
            'Адрес ton',
            'Прокси',
            'User agent',
        ],
        ...results.map((data) => Object.values(data)),
    ]);

    xlsx.utils.book_append_sheet(workBook, workSheet, 'Telegram farm');

    const outputPath = path.join(__dirname, `output.xlsx`);
    xlsx.writeFile(workBook, outputPath);

    baseLogger.log('Результаты сохранены в файл');

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

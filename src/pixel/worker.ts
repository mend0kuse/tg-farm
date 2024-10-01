import { APP_CONFIG } from '../config';
import { REFERRAL_MAP } from '../constants';
import { TAccountData } from '../scripts/accounts-generator';
import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from '../shared/utils';
import { pixelDatabase } from './database';
import { Pixel } from './pixel';

export const runPixelWorker = async (user: TAccountData) => {
    const accounts = excelUtility.getAccounts();

    let errors = 0;

    pixelDatabase.init();

    const refererIndex = REFERRAL_MAP[user.index];
    let refCode = `f${APP_CONFIG.MASTER_USER_ID}`;
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await pixelDatabase.findByIndex(user.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 1) {
                break;
            }

            const refererAccount: any = await pixelDatabase.findByIndex(refererIndex);
            if (refererAccount) {
                const referer = accounts.find((acc) => acc.index === refererAccount.accountIndex)!;
                refCode = `f${referer.id}`;
                break;
            }

            baseLogger.accentLog(
                `[PIXEL_${user.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
            );
            await sleep(60 * 5);
        }

        const { telegramClient } = await telegramApi.createClientBySession({
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        baseLogger.log(`[PIXEL_${user.index}] Телеграм клиент успешно создан`);

        try {
            await new Pixel({
                telegramClient,
                account: user,
                refCode,
                isCreated,
                database: pixelDatabase,
            }).start();

            baseLogger.log(`[PIXEL_${user.index}] Старт воркера`);
        } catch (error) {
            errors++;
            baseLogger.error(`[PIXEL_${user.index}] WORKER ERROR`, error);

            await telegramApi.sendBotNotification(`[PIXEL]. Воркер ${user.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};

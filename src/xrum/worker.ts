import { TelegramClient } from '@mtcute/node';
import { APP_CONFIG } from '../config';
import { REFERRAL_MAP_2 } from '../constants';
import { TAccountData } from '../scripts/accounts-generator';
import { excelUtility } from '../shared/excel/excel';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { random, secondsUntilUTCHour, sleep } from '../shared/utils';
import { xrumDatabase } from './database';
import { Xrum } from './xrum';

export const runHrumWorker = async (user: TAccountData, telegramClient: TelegramClient) => {
    const accounts = excelUtility.getAccounts();

    let errors = 0;

    const refererIndex = REFERRAL_MAP_2[user.index];
    let refCode = `ref${APP_CONFIG.MASTER_USER_ID}`;
    let isCreated = false;

    try {
        xrumDatabase.init();
    } catch (error) {
        baseLogger.error(error);
    }

    while (errors < 5) {
        while (true) {
            const myAccount = await xrumDatabase.findByIndex(user.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 1) {
                break;
            }

            const refererAccount: any = await xrumDatabase.findByIndex(refererIndex);
            if (refererAccount) {
                const { id } = accounts.find((acc) => acc.index === refererIndex)!;
                refCode = `ref${id}`;
                break;
            }

            baseLogger.accentLog(
                `[XRUM_${user.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
            );
            await sleep(60 * 5);
        }

        baseLogger.log(`[XRUM_${user.index}] Телеграм клиент успешно создан`);

        try {
            const hrum = new Xrum({
                telegramClient,
                account: user,
                refCode,
                isCreated,
                database: xrumDatabase,
            });

            await hrum.start();
            const delay = secondsUntilUTCHour(random(7, 9));
            baseLogger.log('[HRUM] Применена задержка до следующего круга. Часов ', delay / 60 / 60);
            await sleep(delay);
        } catch (error) {
            errors++;
            baseLogger.error('[HRUM] WORKER ERROR', error);

            await telegramApi.sendBotNotification(`[HRUM]. Воркер ${user.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};

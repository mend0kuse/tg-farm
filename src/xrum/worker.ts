import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { parseSocks5Proxy, random, sleep } from '../shared/utils';
import { xrumDatabase } from './database';
import { Xrum } from './xrum';

export const runHrumWorker = async (user: TAccountData) => {
    let errors = 0;

    // const refererIndex = REFERRAL_MAP[user.index];
    const refCode = '';
    const isCreated = false;

    xrumDatabase.init();

    while (errors < 5) {
        // while (true) {
        //     const myAccount = await xrumDatabase.findByIndex(user.index);
        //     if (myAccount) {
        //         isCreated = true;
        //         break;
        //     }

        //     const refererAccount = await xrumDatabase.findByIndex(refererIndex);
        //     if (refererAccount) {
        //         refCode += `ref${refererAccount.tgId}`;
        //         break;
        //     }

        //     baseLogger.accentLog(`[XRUM_${user.index}] В базе не найден аккаунт referer. Задержка 5 минут...`);
        //     await sleep(60 * 5);
        // }

        const { telegramClient } = await telegramApi.createClientBySession({
            session: user.session,
            proxy: parseSocks5Proxy(user.proxy),
            sessionName: user.index.toString(),
        });

        try {
            const hrum = new Xrum({
                telegramClient,
                account: user,
                refCode,
                isCreated,
                database: xrumDatabase,
            });

            await hrum.start();
            const delay = hrum.secondsUntilUTCHour(random(7, 9));
            await telegramClient.close();
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

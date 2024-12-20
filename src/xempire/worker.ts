import { TelegramClient } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { sleep, random } from '../shared/utils';
import { xEmpireDatabase } from './database';
import { XEmpire } from './xempire';

export const runEmpireWorker = async (user: TAccountData, telegramClient: TelegramClient) => {
    let cycle = 1;

    xEmpireDatabase.init();

    // const refererIndex = REFERRAL_MAP_2[user.index];
    const refCode = ``;
    const isCreated = true;

    // while (true) {
    //     const myAccount = await xEmpireDatabase.findByIndex(user.index);
    //     if (myAccount) {
    //         isCreated = true;
    //         break;
    //     }

    //     if (refererIndex === 1) {
    //         break;
    //     }

    //     const refererAccount: any = await xEmpireDatabase.findByIndex(refererIndex);
    //     if (refererAccount) {
    //         const { id } = accounts.find((acc) => acc.index === refererIndex)!;
    //         refCode = `hero${id}`;
    //         break;
    //     }

    //     baseLogger.accentLog(`[X_${user.index}] В базе не найден аккаунт referer. Задержка 5 минут...`);
    //     await sleep(60 * 5);
    // }

    while (cycle < 6) {
        try {
            await new XEmpire({
                telegramClient,
                index: user.index,
                ua: user.userAgent,
                proxy: user.proxy,
                mnemonic: user.mnemonicTon,
                database: xEmpireDatabase,
                refCode,
                isCreated,
            }).start();
        } catch (error) {
            baseLogger.error(error);
        }

        const message = `[X_${user.index}]. Воркер прервался. Круг ${cycle}`;
        await telegramApi.sendBotNotification(message);
        baseLogger.log(message);

        await sleep(random(30 * 60, 60 * 60));
        cycle++;
    }
};

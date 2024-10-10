import { TelegramClient } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { baseLogger } from '../shared/logger';
import { telegramApi } from '../shared/telegram/telegram-api';
import { random, sleep } from '../shared/utils';
import { Dao } from './dao';
import { daoDatabase } from './database';
import { REFERRAL_MAP_DAO } from './ref';
import { APP_CONFIG } from '../config';
import { EventBus, EventBusEvents } from '../shared/event-bus';

export const runDaoWorker = async (
    user: TAccountData,
    telegramClient: TelegramClient,
    usersEventBus: EventBus<EventBusEvents>
) => {
    let errors = 0;

    daoDatabase.init();

    const refererIndex = REFERRAL_MAP_DAO[user.index];
    let refCode = refererIndex === 0 ? 'ref_655371130' : `ref_${APP_CONFIG.MASTER_USER_ID}`;
    let isCreated = false;

    while (errors < 5) {
        while (true) {
            const myAccount = await daoDatabase.findByIndex(user.index);
            if (myAccount) {
                isCreated = true;
                break;
            }

            if (refererIndex === 0 || refererIndex === 1) {
                break;
            }

            const refererAccount: any = await daoDatabase.findByIndex(refererIndex);
            if (refererAccount) {
                refCode = refererAccount.refCode;
                if (refCode) {
                    break;
                }
            }

            baseLogger.accentLog(
                `[DAO_${user.index}] В базе не найден аккаунт referer ${refererIndex}. Задержка 5 минут...`
            );

            await sleep(60 * 5);
        }

        try {
            await new Dao({
                telegramClient,
                account: user,
                refCode,
                isCreated,
                database: daoDatabase,
                usersEventBus,
            }).start();
        } catch (error) {
            errors++;
            baseLogger.error(`[DAO_${user.index}] WORKER ERROR`, error);

            await telegramApi.sendBotNotification(`[DAO]. Воркер ${user.index}. Ошибка #${errors}. ${error}`);
            await sleep(random(120, 180));
        }
    }
};

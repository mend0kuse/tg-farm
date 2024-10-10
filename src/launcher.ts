import { EventBus } from './shared/event-bus';
import { excelUtility } from './shared/excel/excel';
import { baseLogger } from './shared/logger';
import { shuffleArray } from './shared/utils';
import { createUserThread } from './thread';

async function start() {
    try {
        const users = excelUtility.getAccounts();

        shuffleArray(users);

        const usersEventBus = new EventBus();

        // Запуск всех
        // await Promise.allSettled(users.map((user) => createUserThread(user)));

        // Запуск группы (Поменять номера аккаунтов)
        // await Promise.allSettled([1, 2, 3].map((index) => createUserThread(excelUtility.getAccountByIndex(index))));

        // Запуск отдельного (Поменять номер аккаунта)
        await createUserThread(excelUtility.getAccountByIndex(2), usersEventBus);
    } catch (error) {
        baseLogger.error('Ошибка: ', error);
    }
}

start();

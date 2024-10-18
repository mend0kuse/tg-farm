import { TelegramClient } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { SQLite3Database } from '../shared/database/sqlite';

export type BaseBotConstructor<Db extends SQLite3Database> = {
    account: TAccountData;
    refCode: string;
    telegramClient: TelegramClient;
    isCreated: boolean;
    database: Db;
};

export type BaseBotParams = {
    botName: string;
    apiUrl: string;
    httpHeaders: Record<string, any>;
};

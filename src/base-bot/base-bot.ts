import axios, { AxiosInstance, isAxiosError } from 'axios';
import { SQLite3Database } from '../shared/database/sqlite';
import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { BaseBotConstructor, BaseBotParams } from './types';
import { random, sleep } from '../shared/utils';
import { toInputUser } from '@mtcute/node/utils.js';

export abstract class BaseBot<Db extends SQLite3Database> {
    api: AxiosInstance;
    API_URL: string;
    account: TAccountData;
    database: Db;
    profile: any;
    telegramClient: TelegramClient;
    logger: BaseLogger;
    refCode: string;
    httpHeaders: Record<string, any>;
    isCreated: boolean = false;
    cycle = 1;

    constructor({
        account,
        isCreated,
        telegramClient,
        database,
        botName,
        apiUrl,
        httpHeaders,
    }: BaseBotConstructor<Db> & BaseBotParams) {
        this.isCreated = isCreated;
        this.database = database;
        this.API_URL = apiUrl;
        this.account = account;
        this.telegramClient = telegramClient;
        this.httpHeaders = httpHeaders;
        this.logger = new BaseLogger(`${botName}_${account.index}`);

        this.createApi();
    }

    abstract login(): Promise<void>;
    abstract start(): Promise<void>;

    async processLogin() {
        let loginAttempts = 0;

        while (true) {
            try {
                await this.login();
                break;
            } catch (error) {
                if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                    this.logger.error('FLOOD WAIT', error.seconds * 2);
                    await sleep(error.seconds * 2);
                    throw new Error('FLOOD');
                }

                if (loginAttempts > 5) {
                    throw new Error('5 Неудачных логинов');
                }

                this.logger.error('Неудачный логин, задержка...', this.handleError(error));
                await sleep(random(100, 150));
                loginAttempts++;

                continue;
            }
        }
    }

    async waitCycleDelay({
        firstCycleRange,
        othersGetDelay,
    }: {
        firstCycleRange: [number, number];
        othersGetDelay?: () => number;
    }) {
        const delayInMinutes =
            this.cycle === 1 ? random(...firstCycleRange) : othersGetDelay ? othersGetDelay() : random(8, 12) * 60;

        this.logger.log(`Задержка ${delayInMinutes} минут перед стартом прохода...`);

        await sleep(delayInMinutes * 60);
    }

    async createDatabaseAccount(...params: Parameters<Db['createAccount']>) {
        if (!this.isCreated) {
            try {
                this.database.createAccount(params);
                this.isCreated = true;
                this.logger.error('Успешно добавлен в базу');
            } catch (error) {
                this.logger.error('Ошибка добавления в базу', error);
            }
        }
    }

    async checkIp() {
        try {
            const ip = (
                await this.api.get('https://ifconfig.me/ip', {
                    baseURL: '',
                })
            ).data;

            this.logger.log('IP =', ip);
        } catch (error) {
            this.logger.error('Ошибка получения IP', this.handleError(error));
            throw error;
        }
    }

    async getWebAppDataUrl(peerName: string) {
        const peer = await this.telegramClient.resolvePeer(peerName);

        const response = await this.telegramClient.call({
            _: 'messages.requestAppWebView',
            peer,
            app: {
                _: 'inputBotAppShortName',
                botId: toInputUser(peer),
                shortName: 'app',
            },
            platform: 'Android',
            startParam: this.refCode,
            writeAllowed: true,
        });

        return response.url;
    }

    // ---- HELPERS ----

    get httpAgent() {
        return this.account.proxy ? new SocksProxyAgent(this.account.proxy) : undefined;
    }

    createApi() {
        this.api = axios.create({
            httpAgent: this.httpAgent,
            httpsAgent: this.httpAgent,
            baseURL: this.API_URL,
            headers: this.httpHeaders,
        });
    }

    handleError(error: unknown) {
        if (isAxiosError(error)) {
            return `Axios error: ${error.status} ${error.code} ${error.message} ${JSON.stringify(error.response?.data ?? {})}`;
        } else {
            return error as string;
        }
    }
}

import { TelegramClient, tl } from '@mtcute/node';
import { TAccountData } from '../scripts/accounts-generator';
import { BaseLogger } from '../shared/logger';
import axios, { AxiosInstance, HttpStatusCode, isAxiosError } from 'axios';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { toInputUser } from '@mtcute/node/utils.js';
import { telegramApi } from '../shared/telegram/telegram-api';
import crypto from 'crypto';
import { random, shuffleArray, sleep } from '../shared/utils';
import { tonUtility } from '../shared/ton/ton-utility';
import { SendMode, fromNano, internal, toNano } from '@ton/core';
import { APP_CONFIG } from '../config';
import { XrumDatabase } from './database';

export class Xrum {
    private API_URL = 'https://api.hrum.me';
    private account: TAccountData;
    private isAuthorized = false;
    private telegramClient: TelegramClient;
    private fullProfile: any = null;
    private peer: null | tl.TypeInputPeer = null;
    private refCode = `ref${APP_CONFIG.MASTER_USER_ID}`;
    private logger;
    private isCreated: boolean = false;
    private api: AxiosInstance;
    private database: XrumDatabase;

    constructor({
        account,
        telegramClient,
        refCode,
        isCreated,
        database,
    }: {
        isCreated: boolean;
        refCode: string;
        account: TAccountData;
        database: XrumDatabase;
        telegramClient: TelegramClient;
    }) {
        this.database = database;
        this.isCreated = isCreated;
        this.logger = new BaseLogger(`HRUM_${account.index}`);
        this.refCode = refCode;
        this.account = account;
        this.telegramClient = telegramClient;

        const agent = account.proxy ? new SocksProxyAgent(account.proxy) : undefined;
        this.api = axios.create({
            httpAgent: agent,
            httpsAgent: agent,
            baseURL: this.API_URL,
            headers: {
                accept: '*/*',
                'accept-language': 'en-US;q=0.8,en;q=0.7',
                'content-type': 'application/json',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                priority: 'u=1, i',
                'User-Agent': account.userAgent,
                'Is-Beta-Server': 'null',
                Origin: 'https://game.hrum.me/',
                Referer: 'https://game.hrum.me/',
                'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                'Sec-Ch-Ua-Mobile': '?1',
                'Sec-Ch-Ua-Platform': '"Android"',
            },
        });
    }

    async start() {
        this.api
            .get('https://ifconfig.me/ip', {
                baseURL: '',
            })
            .then((response) => this.logger.log('IP =', response.data))
            .catch((error) => this.logger.error('Ошибка получения IP', this.handleError(error)));

        mainLoop: while (true) {
            const delayInMinutes = random(1, 120);
            this.logger.log(`Задержка ${delayInMinutes} минут перед стартом прохода...`);
            await sleep(delayInMinutes * 60);

            let loginAttempts = 0;
            loginLoop: while (true) {
                try {
                    await this.login();
                    break loginLoop;
                } catch (error) {
                    if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                        throw new Error('FLOOD');
                    }

                    if (loginAttempts > 5) {
                        throw new Error('5 Неудачных логинов');
                    }

                    this.logger.error('Неудачный логин, задержка...', this.handleError(error));
                    await sleep(random(100, 150));
                    loginAttempts++;

                    continue loginLoop;
                }
            }

            try {
                await this.getProfile();
            } catch (error) {
                this.logger.error('Ошибка получения профиля: ', this.handleError(error));
                continue mainLoop;
            }

            if (!this.fullProfile) continue mainLoop;

            this.logger.accentLog(
                'Успешный логин. Начало прохода. \n',
                this.fullProfile ? `Токены = ${this.money}. \n` : ' ',
                this.fullProfile ? `Печенья = ${this.cookiesHistory?.length}. \n` : ' ',
                this.fullProfile ? `Друзья = ${this.fullProfile.friends.length}` : ''
            );

            if (!this.isCreated) {
                try {
                    this.database.createAccount({ index: this.account.index, tokens: 0, tgId: this.account.id });
                    this.isCreated = true;
                    this.logger.error('Успешно добавлен в базу');
                } catch (error) {
                    this.logger.error('Ошибка добавления в базу', error);
                }
            }

            await sleep(random(5, 10));

            const actions = [
                this.openCookie,
                this.completeAvailableQuests,
                this.connectWallet,
                this.sendTransaction,
                this.claimCompleted,
            ];

            shuffleArray(actions);

            for (const promise of actions) {
                try {
                    if (!this.isAuthorized) {
                        break;
                    }

                    await sleep(random(5, 10));
                    await promise.call(this);
                    await sleep(random(1, 2));
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                if (this.money) {
                    this.database.updateTokensByIndex(this.account.index, this.money);
                }
            } catch (error) {
                this.logger.error('Ошибка обновления токенов:', error);
            }

            this.logger.accentLog('Конец прохода');
            return;
        }
    }

    async getWebAppDataUrl() {
        if (!this.peer) {
            this.peer = await this.telegramClient.resolvePeer('hrummebot');
        }

        try {
            const response = await this.telegramClient.call({
                _: 'messages.requestAppWebView',
                peer: this.peer,
                app: {
                    _: 'inputBotAppShortName',
                    botId: toInputUser(this.peer),
                    shortName: 'game',
                },
                platform: 'Android',
                startParam: this.refCode,
                writeAllowed: true,
            });

            return response.url;
        } catch (error) {
            this.peer = null;
            throw error;
        }
    }

    async login() {
        this.logger.log('Логин');

        const url = await this.getWebAppDataUrl();

        const extractedData = telegramApi.extractWebAppData(url);
        const params = new URLSearchParams(extractedData);
        const userHash = params.get('hash') ?? '';

        if (this.refCode) {
            this.logger.log('REF CODE: ' + this.refCode);
        }

        const login_data = {
            data: {
                chatId: '',
                chatInstance: params.get('chat_instance') ?? '',
                chatType: params.get('chat_type') ?? '',
                initData: extractedData,
                platform: 'android',
                startParam: this.refCode,
            },
        };

        try {
            const response = await this.api.post('/telegram/auth', login_data, {
                headers: { 'Api-Key': 'empty', ...this.createApiHeaders(login_data) },
            });

            if (response.data.success) {
                this.setApiKey(userHash);
                this.isAuthorized = true;
            } else {
                throw new Error(response.data.error);
            }

            return true;
        } catch (error) {
            throw new Error(this.handleError(error));
        }
    }

    async getProfile() {
        this.logger.log('Получения профиля');

        try {
            const dataAll = { data: {} };

            const responseAll = await this.api.post<{ data: any }>('/user/data/all', dataAll, {
                headers: this.createApiHeaders(dataAll),
            });

            const dataAfter = {
                data: { lang: responseAll.data.data.settings?.lang || 'en' },
            };

            await sleep(random(0, 1));

            const responseAfter = await this.api.post<{ data: any }>('/user/data/after', dataAfter, {
                headers: this.createApiHeaders(dataAfter),
            });

            this.fullProfile = {
                ...responseAll.data.data,
                ...responseAfter.data.data,
            };
        } catch (error) {
            this.logger.error('Ошибка получения профиля!', this.handleError(error));
            throw error;
        }
    }

    async claimCompleted() {
        this.logger.log('Сбор награды за выполненные квесты');

        const completedQuests = this.fullProfile.quests.filter((quest: any) => !quest.isRewarded);

        for (const quest of completedQuests) {
            await sleep(random(5, 10));
            await this.claimQuestReward(quest.key);
        }
    }

    async completeAvailableQuests() {
        this.logger.log('Выполнение квестов');

        const actualDbQuests = this.fullProfile.dbData.dbQuests.filter(
            (quest: any) => !this.fullProfile.quests.find((q: any) => q.key === quest.key)
        );

        for (const { isArchived, checkType, key, checkData } of actualDbQuests) {
            if (isArchived) {
                continue;
            }

            if (checkType === 'telegramChannel') {
                await sleep(random(5, 10));

                try {
                    await telegramApi.joinChannel(this.telegramClient, checkData);
                    this.logger.log(`Вступление в канал ${checkData} успешно`);
                } catch (error) {
                    this.logger.error('Ошибка при вступлении в канал: ', this.handleError(error));
                }

                await sleep(random(5, 10));
                try {
                    await this.checkAndClaimQuest(key);
                } catch {
                    //
                }
            }

            if (checkType === 'fakeCheck') {
                await sleep(random(5, 10));
                await this.claimQuestReward(key);
            }

            if (checkType === 'username') {
                await sleep(random(5, 10));
                await telegramApi.updateProfile(this.telegramClient, {
                    firstName: this.fullProfile.firstName + ' ' + checkData,
                });
            }
        }
    }

    async checkAndClaimQuest(quest: string, code: string | null = null) {
        this.logger.log(`Выполнения квеста. ${quest} ${code}`);

        try {
            const data = { data: [quest, code] };
            const response = (
                await this.api.post('/quests/check', data, {
                    headers: this.createApiHeaders(data),
                })
            ).data;

            if (!response.success || !response.data.result) {
                throw new Error(response.error);
            }

            await sleep(random(4, 6));

            await this.claimQuestReward(quest, code);
        } catch (error) {
            this.logger.error('Ошибка выполнения квеста', this.handleError(error));
            throw error;
        }
    }

    async claimQuestReward(quest: string, code: string | null = null) {
        this.logger.log(`Клейм награды за квест ${quest}`);

        try {
            const payload = { data: [quest, code] };

            const response = (
                await this.api.post('/quests/claim', payload, {
                    headers: this.createApiHeaders(payload),
                })
            ).data;

            if (!response.success) {
                throw new Error(response.error);
            }
        } catch (error) {
            this.logger.error('Ошибка получения награды за квест!', this.handleError(error));
        }
    }

    async openCookie() {
        if (!this.isAvailableOpenCookie) {
            this.logger.log('Открытие печенья недоступно');
            return;
        }

        try {
            const payload = { data: {} };

            await this.api.post('/user/cookie/open', payload, {
                headers: this.createApiHeaders(payload),
            });

            this.logger.log('Печенье открыто успешно');
        } catch (error) {
            this.logger.error('Ошибка при открытии печенья', this.handleError(error));
        }
    }

    async connectWallet() {
        if (this.isWalletConnected) {
            this.logger.log('Кошелек уже подключен');
            return;
        } else {
            this.logger.log('Старт подключения кошелька');
        }

        try {
            const payload = { data: await this.getWalletPayload() };

            const response = await this.api.post('/ton/wallet/save', payload, {
                headers: this.createApiHeaders(payload),
            });

            if (!response.data.success) {
                throw new Error(response.data.error);
            }

            await this.checkAndClaimQuest('ton_wallet_connect');
        } catch (error) {
            this.logger.error('Ошибка подключения кошелька:', this.handleError(error));
        }
    }

    async sendTransaction() {
        const key = 'ton_wallet_transaction';

        if (!this.isWalletConnected) {
            this.logger.log('Кошелек не подключен, пропускаем отправку транзакции');
            return;
        }

        if (this.isCompletedQuest('ton_wallet_transaction')) {
            this.logger.log('Транзакция уже отправлена');
            return;
        }

        try {
            await this.checkAndClaimQuest(key);

            this.logger.log('Транзакция уже отправлена');
            return;
        } catch {
            this.logger.log('Попытка отправки транзакции');
        }

        try {
            const balance = await tonUtility.getBalanceByMnemonic(this.mnemonic);

            this.logger.log(
                `Адрес: ${await tonUtility.getWalletAddress(this.mnemonic)}
                Баланс на кошельке: ${fromNano(balance)} ton`
            );

            if (balance <= toNano('0.5')) {
                this.logger.log('Недостаточно баланса для транзакции');
                return;
            }

            const keyPair = await tonUtility.getKeyPair(this.mnemonic);
            const wallet = await tonUtility.getWalletContract(this.mnemonic);
            const contract = tonUtility.contractAdapter.open(wallet);

            await sleep(random(1, 2));

            await contract.sendTransfer({
                sendMode: SendMode.PAY_GAS_SEPARATELY + SendMode.IGNORE_ERRORS,
                seqno: await contract.getSeqno(),
                secretKey: keyPair.secretKey,
                messages: [
                    internal({
                        value: '0.5',
                        to: 'UQC1i9rtkwhqJQDeBZPWEh9Mp-eDsYaFrbcE5Qq3rA85poEq',
                    }),
                ],
            });

            this.logger.log('Ожидание выполнения транзакции. 60-90 секунд...');
            await sleep(random(60, 90));

            await this.checkAndClaimQuest(key);
        } catch (error) {
            this.logger.error('Ошибка отправки транзакции:', this.handleError(error));
        }
    }

    // ---- HELPERS ----

    get money() {
        try {
            return this.fullProfile?.hero.token;
        } catch {
            return null;
        }
    }

    get cookiesHistory() {
        return this.fullProfile?.history ?? null;
    }

    createApiHeaders(data: object) {
        const timeString = Math.floor(Date.now() / 1000).toString();
        const jsonString = JSON.stringify(data);

        const hashString = crypto.createHash('md5').update(`${timeString}_${jsonString}`, 'utf8').digest('hex');

        return {
            'Api-Time': timeString,
            'Api-Hash': hashString,
        };
    }

    setApiKey(userHash: string) {
        this.api.defaults.headers['Api-Key'] = userHash;
    }

    updateProfileHero(hero: any) {
        this.fullProfile.hero = hero;
    }

    handleError(error: unknown) {
        if (isAxiosError(error)) {
            if (error.status === HttpStatusCode.Unauthorized) {
                this.isAuthorized = false;
            }

            return `Axios error: ${error.status} ${error.code} ${error.message} `;
        } else {
            return error as string;
        }
    }

    get isWalletConnected() {
        return this.isCompletedQuest('ton_wallet_connect');
    }

    isCompletedQuest(key: string) {
        return this.fullProfile?.quests.find((quest: any) => quest.key === key);
    }

    get mnemonic() {
        try {
            return this.account.mnemonicTon.split(' ');
        } catch {
            return [];
        }
    }

    async getWalletPayload() {
        const wallet = await tonUtility.getWalletContract(this.mnemonic);
        const walletStateInit = tonUtility.packStateInit(wallet.init);

        return {
            wallet: {
                device: {
                    platform: 'iphone',
                    appName: 'Tonkeeper',
                    appVersion: '4.10.1',
                    maxProtocolVersion: 2,
                    features: [
                        'SendTransaction',
                        {
                            name: 'SendTransaction',
                            maxMessages: 255,
                        },
                    ],
                },
                provider: 'http',
                account: {
                    address: wallet.address.toRawString(),
                    chain: '-239',
                    walletStateInit,
                    publicKey: await tonUtility.getPublicKeyHex(this.mnemonic),
                },
                name: 'Tonkeeper',
                appName: 'tonkeeper',
                imageUrl: 'https://tonkeeper.com/assets/tonconnect-icon.png',
                aboutUrl: 'https://tonkeeper.com',
                tondns: 'tonkeeper.ton',
                platforms: ['ios', 'android', 'chrome', 'firefox', 'macos'],
                bridgeUrl: 'https://bridge.tonapi.io/bridge',
                universalLink: 'https://app.tonkeeper.com/ton-connect',
                deepLink: 'tonkeeper-tc://',
                jsBridgeKey: 'tonkeeper',
                injected: true,
                embedded: false,
                openMethod: 'qrcode',
            },
        };
    }

    private startHour = 6;

    get isAvailableOpenCookie() {
        if (!this.cookiesHistory) {
            return false;
        }

        if (this.cookiesHistory.length === 0) {
            return true;
        }

        const now = new Date();
        const sixAMTodayUTC = new Date(
            Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), this.startHour)
        );

        const sortedHistory = this.cookiesHistory.sort(
            (a: any, b: any) => new Date(b.updateDate).getTime() - new Date(a.updateDate).getTime()
        );

        return sortedHistory[0].updateDate < sixAMTodayUTC.toISOString().replace('T', ' ');
    }

    secondsUntilUTCHour(targetHour: number) {
        const now = new Date();
        const currentUTCHour = now.getUTCHours();

        let ms;

        if (currentUTCHour < targetHour) {
            const nextTargetTimeToday = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), targetHour)
            );

            ms = nextTargetTimeToday.getTime() - now.getTime();
        } else {
            const nextTargetTimeTomorrow = new Date(
                Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1, targetHour)
            );

            ms = nextTargetTimeTomorrow.getTime() - now.getTime();
        }

        return ms / 1000;
    }
}

import { tonUtility } from './../shared/ton/ton-utility';
import crypto from 'crypto';
import axios, { AxiosInstance, HttpStatusCode, isAxiosError } from 'axios';
import { BaseLogger } from '../shared/logger';
import { random, randomArrayItem, shuffleArray, sleep } from '../shared/utils';
import moment from 'moment-timezone';
import { SendMode, fromNano, internal, toNano } from '@ton/ton';
import { APP_CONFIG } from '../config';
import { SocksProxyAgent } from 'socks-proxy-agent';
import { TelegramClient, tl } from '@mtcute/node';
import { toInputUser } from '@mtcute/node/utils.js';
import { telegramApi } from '../shared/telegram/telegram-api';
import { xEmpireDatabase } from './database';

export class XEmpire {
    private API_URL = 'https://api.xempire.io';

    private api: AxiosInstance;
    private isAuthorized: boolean = false;
    private telegramClient: TelegramClient;
    private fullProfile: any = null;
    private mnemonic;
    private index;
    private peer: null | tl.TypeInputPeer = null;
    private refCode;
    private logger;
    private externalData: {
        youtube: Record<string, string | number>;
        investmentComboKeys: string[] | null;
    } | null = null;

    constructor({
        proxy,
        ua,
        telegramClient,
        mnemonic,
        refCode,
        index,
    }: {
        proxy?: string;
        ua: string;
        telegramClient: TelegramClient;
        mnemonic: string;
        refCode: string;
        index: number;
    }) {
        this.logger = new BaseLogger(`X_${index}`);

        this.telegramClient = telegramClient;
        this.mnemonic = mnemonic.split(' ');
        this.refCode = refCode;
        this.index = index;

        const agent = proxy ? new SocksProxyAgent(proxy) : undefined;
        this.api = axios.create({
            httpAgent: agent,
            httpsAgent: agent,
            baseURL: this.API_URL,
            headers: {
                accept: '*/*',
                'accept-language': 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7',
                'cache-control': 'no-cache',
                'content-type': 'application/json',
                pragma: 'no-cache',
                priority: 'u=1, i',
                'sec-fetch-dest': 'empty',
                'sec-fetch-mode': 'cors',
                'sec-fetch-site': 'same-site',
                'User-Agent': ua,
                'Is-Beta-Server': 'null',
                Origin: 'https://game.xempire.io',
                Referer: 'https://game.xempire.io/',
                'Sec-Ch-Ua': '"Chromium";v="128", "Not;A=Brand";v="24", "Google Chrome";v="128"',
                'Sec-Ch-Ua-Mobile': '?1',
                'Sec-Ch-Ua-Platform': '"Android"',
            },
        });
    }

    async start() {
        let cycleNumber = 0;

        this.api
            .get('https://ifconfig.me/ip', {
                baseURL: '',
            })
            .then((response) => this.logger.log('IP =', response.data))
            .catch((error) => this.logger.error('Ошибка получения IP', this.handleError(error)));

        mainLoop: while (true) {
            cycleNumber++;

            const firstCycleDelayMinutes = random(10, 60);
            const delayInMinutes = this.level ? this.getDelayByLevel(this.level) : firstCycleDelayMinutes;

            this.logger.accentLog(
                `Задержка ${delayInMinutes} минут перед стартом прохода #${cycleNumber}...`,
                cycleNumber > 1 ? `Текущий уровень ${this.level}. ` : ' ',
                this.fullProfile ? `Кол-во друзей ${this.fullProfile.friends.length}` : ''
            );

            await sleep(delayInMinutes * 60);
            await this.getExternalData();

            let loginAttempts = 0;
            let loginError;

            loginLoop: while (true) {
                try {
                    await this.login();
                    break loginLoop;
                } catch (error) {
                    if (loginAttempts > 5) {
                        this.logger.error('5 Неудачных логинов, пропускаем круг...');

                        await telegramApi.sendBotNotification(
                            `[EMPIRE] 5 Неудачных логинов. Пользователь #${
                                this.index
                            }. Ошибка: ${this.handleError(loginError)}`
                        );

                        return;
                    }

                    if (tl.RpcError.is(error, 'FLOOD_WAIT_%d')) {
                        await telegramApi.sendBotNotification(
                            `[EMPIRE]. Воркер ${this.index}. Ошибка по флуду. Выключение...`
                        );

                        return;
                    }

                    loginError = error;
                    this.logger.error('Неудачный логин, задержка...', this.handleError(error));
                    await sleep(random(3, 5));
                    loginAttempts++;

                    continue loginLoop;
                }
            }

            this.fullProfile = await this.getProfile();
            if (!this.fullProfile) continue mainLoop;

            await sleep(random(1, 2));

            await this.claimOfflineBonus();

            const actions = [
                this.completeFakeCheckQuests,
                this.completeCheckIn,
                this.connectWallet,
                this.completeFriends,
                this.completeInvestments,
                this.completeMining,
            ];

            const actionsSecondary = [
                this.sendTransaction,
                this.completeRiddleAndRebus,
                this.completeImprovements,
                this.completeBoxes,
                this.claimCompletedQuests,
                this.completeDailyQuests,
            ];

            shuffleArray(actions);
            shuffleArray(actionsSecondary);

            for (const promise of [...actions, ...actionsSecondary]) {
                try {
                    if (!this.isAuthorized) {
                        break;
                    }

                    await sleep(random(5, 10));
                    await promise.call(this);
                    await sleep(random(1, 2));
                    await this.syncBalance();
                } catch (error) {
                    this.logger.error('Ошибка выполнения промиса:', this.handleError(error));
                }
            }

            try {
                if (this.level) {
                    const updated = await xEmpireDatabase.updateLevelByIndex(this.index, this.level);
                    this.logger.log('Статус обновления: ', updated.acknowledged);
                }
            } catch (error) {
                this.logger.error('Ошибка обновления базы данных', error);
            }
        }
    }

    async connectWallet() {
        if (this.isWalletConnected) {
            this.logger.log('Кошелек уже подключен');
            return;
        } else {
            if (this.level < 3) {
                this.logger.log('Попытка подключить кошелек. Уровень меньше 3');
                return;
            }

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

            await this.completeQuest('ton_wallet_connect');
        } catch (error) {
            this.logger.error('Ошибка подключения кошелька:', this.handleError(error));
        }
    }

    async checkQuest(quest: string, code: string | null = null) {
        const data = { data: [quest, code] };

        const response = (
            await this.api.post('/quests/check', data, {
                headers: this.createApiHeaders(data),
            })
        ).data;

        if (!response.success) {
            throw new Error(response.error);
        }

        return true;
    }

    async sendTransaction() {
        const key = 'ton_wallet_transaction';

        if (!this.isWalletConnected) {
            this.logger.log('Кошелек не подключен, пропускаем отправку транзакции');
            return;
        }

        if (this.isCompletedQuest('ton_wallet_transaction')) {
            return;
        }

        try {
            await this.checkQuest(key);

            try {
                await this.claimQuestReward(key);
            } catch {
                //
            }

            this.logger.log('Транзакция уже отправлена');
            return;
        } catch {
            this.logger.log('Старт отправки транзакции');
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
                        to: 'UQCSy3mcYhfzHcAXfQGZSdNq3HViZEcKA-MpX6Qcvr4oCeuB',
                    }),
                ],
            });

            this.logger.log('Ожидание выполнения транзакции. 60-90 секунд...');
            await sleep(random(60, 90));

            await this.completeQuest(key);
        } catch (error) {
            this.logger.error('Ошибка отправки транзакции:', this.handleError(error));
        }
    }

    /**
     * Улучшить скиллы
     */

    async completeImprovements() {
        let attempts = 0;
        const ignoredSkills: string[] = [];

        while (true) {
            if (!this.isAuthorized) {
                break;
            }

            await sleep(random(3, 5));

            const bestSkill = this.calculateBestSkill({
                ignoredSkills,
                allSKills: this.fullProfile.dbData.dbSkills,
                balance: this.fullProfile.hero?.money,
                friends: this.fullProfile.friends.length,
                level: this.fullProfile.hero?.level,
                mode: randomArrayItem(['price', 'profit']),
                mySkills: this.fullProfile.skills,
            });

            if (!bestSkill) {
                if (attempts < 5) {
                    this.logger.log('Скиллы закончились. Немного подождем...');
                    await sleep(random(30, 60));
                    await this.syncBalance();
                    attempts++;

                    continue;
                }

                this.logger.log('Завершение прокачки...');
                break;
            }

            try {
                await this.improveSkill(bestSkill.key);
            } catch (error) {
                ignoredSkills.push(bestSkill.key);
                this.logger.error(`Ошибка прокачки ${bestSkill.key}...`, this.handleError(error));
                await sleep(random(2, 3));
                await this.syncBalance();
                attempts++;
            }
        }
    }

    /**
     * Выполнить инвестирование
     */

    async completeInvestments() {
        if (!this.externalData || !this.externalData.investmentComboKeys) {
            this.logger.log('Нет данных для инвестиций');

            return;
        }

        try {
            const data = await this.getFunds();
            if (!data) {
                return;
            }

            const alreadyInvestedKeys = data.funds.map((item: any) => item.fundKey);

            for (const key of this.externalData.investmentComboKeys) {
                if (alreadyInvestedKeys.includes(key)) {
                    continue;
                }

                await sleep(random(3, 5));

                await this.investInFund(
                    key,
                    this.calculateBet(
                        this.level,
                        this.fullProfile.hero.moneyPerHour ?? 0,
                        this.fullProfile.hero.money ?? 0
                    )
                );
            }
        } catch (error) {
            this.logger.error('Ошибка инвестирования:', this.handleError(error));
        }
    }

    /**
     * Произвести майнинг
     */

    async completeMining() {
        let tappedToday = 0;

        while (true) {
            if (this.fullProfile.questsDaily.tap.isComplete) {
                this.logger.log('Дневная норма выполнена');
                break;
            }

            const { moneyPerTap, energy, bonusChance, bonusMultiplier, recoveryPerSecond } =
                this.fullProfile.hero.earns.task;

            this.logger.log(`Энергия: ${energy}`);

            if (energy < moneyPerTap || tappedToday >= this.tapLimit) {
                break;
            }

            let earnedMoney = 0;
            const tapsPerSecond = random(random(5, 6), random(9, 10));
            const seconds = random(4, 7);
            const tapsCount = tapsPerSecond * seconds;

            for (let i = 1; i <= tapsCount; i++) {
                const tapPower = this.calculateTapPower(moneyPerTap, energy, bonusChance, bonusMultiplier);

                earnedMoney += tapPower;
            }

            await sleep(seconds);

            try {
                const payload = {
                    data: {
                        data: {
                            task: {
                                amount: earnedMoney,
                                currentEnergy: energy - earnedMoney + recoveryPerSecond * seconds,
                            },
                        },
                        seconds,
                    },
                };

                const response = (
                    await this.api.post('/hero/action/tap', payload, {
                        headers: this.createApiHeaders(payload),
                    })
                ).data;

                if (!response.success || response.error?.includes('too many taps')) {
                    break;
                }

                this.updateProfileHero(response.data.hero);
                tappedToday = response.data.tapped_today;
            } catch (error) {
                this.logger.error('Ошибка во время тапов:', this.handleError(error));
            }
        }

        this.logger.log(`Майнинг закончен tapped_today: ${tappedToday}`);
    }

    /**
     * Открыть коробки
     */

    async completeBoxes() {
        try {
            const response = (
                await this.api.post(
                    '/box/list',
                    {},
                    {
                        headers: this.createApiHeaders({}),
                    }
                )
            ).data;

            if (!response.success) {
                throw new Error(response.error);
            }

            for (const boxName of Object.keys(response.data)) {
                const payload = { data: boxName };
                try {
                    const { success } = (
                        await this.api.post('/box/open', payload, {
                            headers: this.createApiHeaders(payload),
                        })
                    ).data;

                    if (!success) {
                        throw new Error(response.data.error);
                    }

                    this.logger.log(`Успешно открыто ${boxName}`);
                } catch (error) {
                    this.logger.error(`Ошибка открытия коробки ${boxName}`, this.handleError(error));
                }
            }
        } catch (error) {
            this.logger.error('Ошибка при открытии коробок', this.handleError(error));
        }
    }

    /**
     * Выполнение квестов без подтверждения
     */

    async completeFakeCheckQuests() {
        const actualDbQuests = this.fullProfile.dbData.dbQuests.filter(
            (quest: any) => !this.fullProfile.quests.find((q: any) => q.key === quest.key)
        );

        for (const { isArchived, checkType, key, requiredLevel, checkData } of actualDbQuests) {
            if (requiredLevel > this.level || isArchived) {
                continue;
            }

            if (checkType === 'telegramChannel') {
                await sleep(random(2, 4));

                try {
                    await telegramApi.joinChannel(this.telegramClient, checkData);
                    this.logger.log(`Вступление в канал ${checkData} успешно`);
                } catch (error) {
                    this.logger.error('Ошибка при вступлении в канал: ', this.handleError(error));
                }

                await sleep(random(5, 10));
                await this.completeQuest(key);
            }

            if (checkType === 'fakeCheck') {
                await sleep(random(5, 10));
                await this.claimQuestReward(key);
            }
        }
    }

    async claimCompletedQuests() {
        for (const quest of this.fullProfile.quests) {
            if (!quest.isRewarded) {
                await sleep(random(2, 4));
                await this.claimQuestReward(quest.key);
            }
        }
    }

    /**
     * Награда за друзей
     */

    async completeFriends() {
        this.logger.log('Старт сбора награды за друзей');

        for (const friend of this.fullProfile.friends) {
            if (friend.bonusToTake > 0) {
                await sleep(random(3, 4));

                this.logger.log(`Клейма за друга. Друг ${friend.id}`);

                try {
                    const payload = { data: friend.id };
                    const response = (
                        await this.api.post('/friends/claim', payload, {
                            headers: this.createApiHeaders(payload),
                        })
                    ).data;

                    if (!response.success) {
                        throw new Error(response.error);
                    }

                    this.updateProfileHero(response.data.hero);
                } catch (error) {
                    this.logger.error('Ошибка клейма за друга', this.handleError(error));
                }
            }
        }
    }

    /**
     * Награда за ежедневный вход
     */

    async completeCheckIn() {
        this.logger.log('Клейм ежедневной награды');

        const day = Object.entries(this.fullProfile.dailyRewards).find(([, status]) => status == 'canTake')?.[0];

        if (!day) {
            this.logger.log('Ежедневная награда собрана');
            return;
        }

        try {
            const payload = { data: day };
            const response = (
                await this.api.post('/quests/daily/claim', payload, {
                    headers: this.createApiHeaders(payload),
                })
            ).data;

            if (!response.success) {
                throw new Error(response.error);
            }

            this.updateProfileHero(response.data.hero);
        } catch (error) {
            this.logger.error('Ошибка получения дневного бонуса!', this.handleError(error));
        }
    }

    /**
     * Проверка и клейм квеста
     */

    async completeQuest(quest: string, code: string | null = null) {
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
        }
    }

    /**
     * Выполнение загадки и ребуса
     */

    async completeRiddleAndRebus() {
        this.logger.log('Выполнение ребуса и загадки');

        let riddleKey = '';
        let riddleAnswer = '';
        let riddleReqLevel = 0;
        let rebusKey = '';
        let rebusAnswer = '';
        let rebusReqLevel = 0;

        for (const quest of this.fullProfile.dbData.dbQuests) {
            const isRiddle = quest.key.includes('riddle');
            const isRebus = quest.key.includes('rebus');
            if (!isRiddle && !isRebus) {
                continue;
            }

            const tz = 'Europe/Moscow';
            const today = moment().tz(tz);
            const dateStart = quest.dateStart ? moment(quest.dateStart.replace(' ', 'T') + 'Z').tz(tz) : null;

            const dateEnd = quest.dateEnd ? moment(quest.dateEnd.replace(' ', 'T') + 'Z').tz(tz) : null;

            if (quest.isArchived || !dateEnd || !dateStart || dateEnd < today || dateStart > today) {
                continue;
            }

            if (isRiddle) {
                riddleKey = quest.key;
                riddleAnswer = quest.checkData;
                riddleReqLevel = quest.requiredLevel;
            }

            if (isRebus) {
                rebusKey = quest.key;
                rebusAnswer = quest.checkData;
                rebusReqLevel = quest.requiredLevel;
            }
        }

        const needRiddle =
            !!(riddleKey && riddleAnswer) &&
            !this.fullProfile.quests.find((quest: any) => quest.key.includes(riddleKey));

        const needRebus =
            !!(rebusKey && rebusAnswer) && !this.fullProfile.quests.find((quest: any) => quest.key.includes(rebusKey));

        try {
            if (needRiddle && this.level >= riddleReqLevel) {
                await this.completeQuest(riddleKey, riddleAnswer);
            }

            await sleep(random(4, 7));

            if (needRebus && this.level >= rebusReqLevel) {
                await this.completeQuest(rebusKey, rebusAnswer);
            }
        } catch (error) {
            this.logger.error('Ошибка выполнения ребуса и загадки', this.handleError(error));
        }
    }

    /**
     * Клейм оффлайн бонуса
     */

    async claimOfflineBonus() {
        this.logger.log('Старт клейма офлайн бонуса.');

        try {
            await this.api.post(
                '/hero/bonus/offline/claim',
                {},
                {
                    headers: this.createApiHeaders({}),
                }
            );
        } catch (error) {
            this.logger.error('Ошибка офлайн бонуса', this.handleError(error));
        }
    }

    async getWebAppDataUrl() {
        if (!this.peer) {
            this.peer = await this.telegramClient.resolvePeer('empirebot');
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

    /**
     * Вход в игру
     */

    async login() {
        this.logger.log('Логин');

        let url = '';

        try {
            url = await this.getWebAppDataUrl();
        } catch (e) {
            if (tl.RpcError.is(e, 'FLOOD_WAIT_%d')) {
                this.logger.error(`FLOOD_WAIT Ожидание ${e.seconds * 2} секунд...`);
                await sleep(e.seconds * 2);
                url = await this.getWebAppDataUrl();
            } else {
                throw e;
            }
        }

        const extractedData = telegramApi.extractWebAppData(url);
        const params = new URLSearchParams(extractedData);
        const userHash = params.get('hash') ?? '';

        this.logger.log('REF CODE: ' + this.refCode);

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

    /**
     * Получение профиля
     */

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

            await sleep(random(1, 2));

            const responseAfter = await this.api.post<{ data: any }>('/user/data/after', dataAfter, {
                headers: this.createApiHeaders(dataAfter),
            });

            return {
                ...responseAll.data.data,
                ...responseAfter.data.data,
            };
        } catch (error) {
            this.logger.error('Ошибка получения профиля!', this.handleError(error));
            return null;
        }
    }

    /**
     * Получение инвестиций
     */

    async getFunds() {
        this.logger.log('Получение инвестиций');

        try {
            const response = await this.api.post<{ data: any }>(
                '/fund/info',
                {},
                {
                    headers: this.createApiHeaders({}),
                }
            );

            return response.data.data;
        } catch (error) {
            this.logger.error('Ошибка получения инвестиций!', this.handleError(error));
            return null;
        }
    }

    /**
     * Инвестировать в фонд
     */

    async investInFund(fund: string, money: number) {
        this.logger.log(`Инвестирование ${money} в `, fund);

        try {
            const payload = { data: { fund, money } };
            const response = (
                await this.api.post('/fund/invest', payload, {
                    headers: this.createApiHeaders(payload),
                })
            ).data;

            if (!response.success) {
                throw new Error(response.error);
            }

            this.logger.log('Успешно инвестировали в фонд:', fund);

            await sleep(random(1, 3));
            await this.syncBalance();
        } catch (error) {
            this.logger.error('Ошибка инвестирования в фонд!', this.handleError(error));
        }
    }

    /**
     * Улучшить скилл
     */

    async improveSkill(skill: string) {
        this.logger.log(`Улучшение ${skill}`);

        const payload = { data: skill };
        const { data, success, error } = (
            await this.api.post('/skills/improve', payload, {
                headers: this.createApiHeaders(payload),
            })
        ).data;

        if (!success) {
            throw new Error(error);
        }

        this.updateProfileHero(data.hero);
        this.fullProfile.skills = data.skill;
    }

    /**
     * Клейм награды за квест
     */

    async claimQuestReward(quest: string, code: string | null = null) {
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

            this.logger.log(`Успешный клейм награды за квест ${quest}`);
            this.updateProfileHero(response.data.hero);
        } catch (error) {
            this.logger.error('Ошибка получения награды за квест!', this.handleError(error));
        }
    }

    async getExternalData() {
        try {
            this.logger.log('Получение внешних данных...');
            const { data } = await axios.get(APP_CONFIG.EXTERNAL_DATA_URL);

            this.externalData = data.data;
        } catch (error) {
            this.logger.error('Ошибка получения внешних данных!', this.handleError(error));
        }
    }

    /**
     * Клейм награды за ЕЖЕДНЕВНЫЙ квест
     */

    async claimDailyQuestReward(quest: string, code: string | number | null = null) {
        try {
            const payload = { data: { quest, code } };

            const response = (
                await this.api.post('/quests/daily/progress/claim', payload, {
                    headers: this.createApiHeaders(payload),
                })
            ).data;

            if (!response.success) {
                throw new Error(response.error);
            }

            this.logger.log(`Успешный клейм награды за ежедневный квест ${quest}`);
            this.fullProfile.hero = response.data.hero;
        } catch (error) {
            this.logger.error('Ошибка получения награды за ежедневный квест!', this.handleError(error));
        }
    }

    /**
     * Забрать доступные награды за ежедневные квесты
     */

    async completeDailyQuests() {
        try {
            const response = (
                await this.api.post(
                    '/quests/daily/progress/all',
                    {},
                    {
                        headers: this.createApiHeaders({}),
                    }
                )
            ).data;

            if (!response.success) {
                throw new Error(response.error);
            }

            for (const [name, _info] of Object.entries(response.data)) {
                const info = _info as any;

                if (info.isRewarded) {
                    continue;
                }

                if (name.includes('youtube')) {
                    const answer = this.externalData?.youtube[info.url];

                    if (this.externalData?.youtube && !answer) {
                        await telegramApi.sendBotNotification(`[X-EMPIRE] Нужен код для видео ${info.url}`);
                        this.logger.log('Успешно отправлено уведомление о новом видео');
                    }

                    if (answer) {
                        await sleep(random(1, 2));
                        await this.claimDailyQuestReward(name, answer);
                    }

                    continue;
                }

                if (info.isComplete) {
                    await sleep(random(1, 2));
                    await this.claimDailyQuestReward(name);
                }
            }
        } catch (error) {
            this.logger.error('Ошибка получения награды за ежедневные квесты!', this.handleError(error));
        }
    }

    async syncBalance() {
        try {
            const response = await this.api.post(
                '/hero/balance/sync',
                {},
                {
                    headers: this.createApiHeaders({}),
                }
            );

            this.logger.log('Синхронизовано');

            this.updateProfileHero(response.data.data.hero);
        } catch (error) {
            this.logger.error('Ошибка синхронизации!', this.handleError(error));
        }
    }

    // ---- HELPERS ----

    createApiHeaders(data: object) {
        const timeString = Math.floor(Date.now() / 1000).toString();
        const jsonString = JSON.stringify(data);

        const hashString = crypto.createHash('md5').update(`${timeString}_${jsonString}`, 'utf8').digest('hex');

        return {
            'Api-Time': timeString,
            'Api-Hash': hashString,
        };
    }

    get level() {
        try {
            return this.fullProfile.hero.level;
        } catch {
            return null;
        }
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

    get tapLimit() {
        return this.myLevelInfo?.tapLimit ?? 0;
    }

    get myLevelInfo() {
        try {
            return this.fullProfile.dbData.dbLevels.find((levelInfo: any) => levelInfo.level === this.level);
        } catch {
            return null;
        }
    }

    get isWalletConnected() {
        return this.isCompletedQuest('ton_wallet_connect');
    }

    isCompletedQuest(key: string) {
        return this.fullProfile?.quests.find((quest: any) => quest.key === key);
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

    getPrice(e: any, t: any) {
        return t ? this.calculate(e.priceFormula, t, e.priceBasic, e.priceFormulaK) : 0;
    }

    getProfit(e: any, t: any) {
        return t ? this.calculate(e.profitFormula, t, e.profitBasic, e.profitFormulaK, e) : 0;
    }

    calculate(e: any, t: any, s: any, c: any, r = null) {
        let i = s;

        switch (e) {
            case 'fnCompound':
                i = this.fnCompound(t, s, c);
                break;
            case 'fnLogarithmic':
                i = this.fnLogarithmic(t, s);
                break;
            case 'fnLinear':
                i = this.fnLinear(t, s);
                break;
            case 'fnQuadratic':
                i = this.fnQuadratic(t, s);
                break;
            case 'fnCubic':
                i = this.fnCubic(t, s);
                break;
            case 'fnExponential':
                i = this.fnExponential(t, s, c);
                break;
            case 'fnPayback':
                i = this.fnPayback(t, r);
                break;
        }

        return this.smartRound(i);
    }

    tr(s: number, c = 100) {
        return Math.round(s / c) * c;
    }

    smartRound(e: number) {
        if (e < 50) {
            return Math.round(e);
        } else if (e < 100) {
            return this.tr(e, 5);
        } else if (e < 500) {
            return this.tr(e, 25);
        } else if (e < 1000) {
            return this.tr(e, 50);
        } else if (e < 5000) {
            return this.tr(e, 100);
        } else if (e < 10000) {
            return this.tr(e, 200);
        } else if (e < 100000) {
            return this.tr(e, 500);
        } else if (e < 500000) {
            return this.tr(e, 1000);
        } else if (e < 1000000) {
            return this.tr(e, 5000);
        } else if (e < 50000000) {
            return this.tr(e, 10000);
        } else if (e < 100000000) {
            return this.tr(e, 50000);
        } else {
            return this.tr(e, 100000);
        }
    }

    fnLinear(e: number, t: number) {
        return t * e;
    }

    fnQuadratic(e: number, t: number) {
        return t * e * e;
    }

    fnCubic(e: number, t: number) {
        return t * e * e * e;
    }

    fnExponential(e: number, t: number, s: number) {
        return t * Math.pow(s / 10, e);
    }

    fnLogarithmic(e: number, t: number) {
        return t * Math.log2(e + 1);
    }

    fnCompound(e: number, t: number, s: number) {
        const c = s / 100;
        return t * Math.pow(1 + c, e - 1);
    }

    fnPayback(e: number, t: any) {
        const s = [0];
        for (let c = 1; c <= e; c++) {
            const r = s[c - 1];
            const i = this.getPrice(t, c);
            const S = t.profitBasic + t.profitFormulaK * (c - 1);
            const L = this.smartRound(r + i / S);
            s.push(L);
        }
        return s[e];
    }

    calculateBestSkill({
        allSKills,
        balance,
        ignoredSkills,
        level,
        mySkills,
        friends,
        mode = 'price',
    }: {
        allSKills: any;
        mySkills: any;
        ignoredSkills?: any[];
        friends: number;
        level: any;
        balance: any;
        mode: TImproveMode;
    }) {
        const possibleSkills = [];
        for (const skill of allSKills) {
            if ((ignoredSkills ?? []).includes(skill.key)) continue;
            if (skill.profitBasic === 0) continue;

            const possibleSkill = this.getPossibleSkill({
                skill,
                mySkills,
                level,
                balance,
                friends,
            });
            if (possibleSkill) {
                possibleSkills.push(possibleSkill);
            }
        }

        if (possibleSkills.length === 0) {
            return null;
        }

        switch (mode) {
            case 'profit':
                possibleSkills.sort((a, b) => b.profit - a.profit);
                break;
            case 'price':
                possibleSkills.sort((a, b) => b.price - a.price);
                break;
            default:
                break;
        }

        return possibleSkills[0];
    }

    getPossibleSkill({
        balance,
        friends,
        level,
        mySkills,
        skill,
    }: {
        skill: any;
        mySkills: any;
        level: any;
        balance: any;
        friends: any;
    }) {
        let isPossible = false;
        const currentSkill = mySkills[skill.key];
        let skillPrice;
        let skillProfit;

        if (currentSkill) {
            if (skill.maxLevel <= currentSkill.level) return null;

            if (typeof currentSkill.finishUpgradeDate === 'string') {
                currentSkill.finishUpgradeDate = new Date(currentSkill.finishUpgradeDate).getTime() / 1000;
            }
            if (
                typeof currentSkill.finishUpgradeDate === 'number' &&
                currentSkill.finishUpgradeDate > Date.now() / 1000
            ) {
                return null;
            }

            skillPrice = this.getPrice(skill, currentSkill.level + 1);
            const currentProfit = this.getProfit(skill, currentSkill.level);
            const nextProfit = this.getProfit(skill, currentSkill.level + 1);
            skillProfit = nextProfit - currentProfit;
        } else {
            skillPrice = this.getPrice(skill, 1);
            skillProfit = this.getProfit(skill, 1);
        }

        if (balance < skillPrice) {
            return null;
        }

        if (!skill.levels) {
            isPossible = true;
        } else {
            let matchedSkillLimit = null;
            if (currentSkill) {
                for (const constrainedSkill of skill.levels) {
                    if (currentSkill.level + 1 === constrainedSkill.level) {
                        matchedSkillLimit = constrainedSkill;
                        break;
                    }
                }
            } else {
                matchedSkillLimit = skill.levels[0].level === 1 ? skill.levels[0] : null;
            }

            if (!matchedSkillLimit) {
                isPossible = true;
            } else if (matchedSkillLimit.requiredHeroLevel <= level && matchedSkillLimit.requiredFriends <= friends) {
                if (!matchedSkillLimit.requiredSkills) {
                    isPossible = true;
                } else {
                    for (const [reqSkill, reqLevel] of Object.entries(matchedSkillLimit.requiredSkills)) {
                        if (mySkills[reqSkill]?.level >= (reqLevel as number)) {
                            isPossible = true;
                        } else {
                            isPossible = false;
                            break;
                        }
                    }
                }
            }
        }

        if (isPossible) {
            skill.price = skillPrice;
            skill.profit = skillProfit;
            skill.newlevel = mySkills[skill.key]?.level ? mySkills[skill.key].level + 1 : 1; // новый уровень или 1 для покупки
            return skill;
        }

        return null;
    }

    numberShort(value: number, roundValue = false) {
        if (Math.abs(value) < 1e3) {
            return value.toFixed(0);
        }

        let result;
        if (Math.abs(value) >= 1e3 && Math.abs(value) < 1e6) {
            result = value / 1e3;
            return `${roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10}K`;
        }

        if (Math.abs(value) >= 1e6 && Math.abs(value) < 1e9) {
            result = value / 1e6;
            return `${roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10}M`;
        }

        if (Math.abs(value) >= 1e9 && Math.abs(value) < 1e12) {
            result = value / 1e9;
            return `${roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10}B`;
        }

        if (Math.abs(value) >= 1e12) {
            result = value / 1e12;
            return `${roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10}T`;
        }
    }

    calculateTapPower(perTap: number, energy: number, bonusChance: number, bonusMultiplier: number) {
        if (perTap > energy) {
            return 0;
        }

        if (perTap * bonusMultiplier <= energy) {
            const gain = Math.random() * 100 <= bonusChance;
            return gain ? perTap * bonusMultiplier : perTap;
        }

        return perTap;
    }

    calculateBet(level: number, mph: number, balance: number) {
        const betStepsCount = 7; // from game js, may be changed in the future

        function smartZeroRound(amount: number) {
            function roundToNearest(value: number, base = 100) {
                return Math.round(value / base) * base;
            }

            if (amount < 100) {
                return roundToNearest(amount, 50);
            } else if (amount < 1000) {
                return roundToNearest(amount, 100);
            } else if (amount < 10000) {
                return roundToNearest(amount, 1000);
            } else if (amount < 100000) {
                return roundToNearest(amount, 10000);
            } else if (amount < 1000000) {
                return roundToNearest(amount, 100000);
            } else if (amount < 10000000) {
                return roundToNearest(amount, 1000000);
            } else if (amount < 100000000) {
                return roundToNearest(amount, 10000000);
            } else {
                return roundToNearest(amount, 1000);
            }
        }

        function minBet() {
            let multiplier = 2;
            if (level < 3) {
                multiplier = 5;
            } else if (level < 6) {
                multiplier = 4;
            } else if (level < 10) {
                multiplier = 3;
            }

            const calculatedBet = smartZeroRound((mph * multiplier) / (betStepsCount * 3));
            return calculatedBet || 100;
        }

        function maxBet() {
            return minBet() * betStepsCount;
        }

        let availBet = 0;
        let currentMaxBet = maxBet();

        if (currentMaxBet < balance) {
            availBet = currentMaxBet;
        } else {
            const currentMinBet = minBet();
            while (currentMaxBet > balance && currentMaxBet - currentMinBet >= currentMinBet) {
                currentMaxBet -= currentMinBet;
            }
            availBet = Math.max(currentMaxBet, currentMinBet);
        }

        return availBet;
    }

    getDelayByLevel(level: number) {
        const minDelay = 5;
        const maxDelay = 210;
        const maxLevel = 25;

        const delay = minDelay + ((maxDelay - minDelay) / (maxLevel - 1)) * (level - 1);

        return Math.round(random(delay - 1, delay + 1));
    }
}

export type TImproveMode = 'profit' | 'price';

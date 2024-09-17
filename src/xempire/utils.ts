import { random } from '../shared/utils';
import { REFERRAL_MAP } from './constants';

function getPrice(e: any, t: any) {
    return t ? calculate(e.priceFormula, t, e.priceBasic, e.priceFormulaK) : 0;
}

function getProfit(e: any, t: any) {
    return t ? calculate(e.profitFormula, t, e.profitBasic, e.profitFormulaK, e) : 0;
}

function calculate(e: any, t: any, s: any, c: any, r = null) {
    let i = s;

    switch (e) {
        case 'fnCompound':
            i = fnCompound(t, s, c);
            break;
        case 'fnLogarithmic':
            i = fnLogarithmic(t, s);
            break;
        case 'fnLinear':
            i = fnLinear(t, s);
            break;
        case 'fnQuadratic':
            i = fnQuadratic(t, s);
            break;
        case 'fnCubic':
            i = fnCubic(t, s);
            break;
        case 'fnExponential':
            i = fnExponential(t, s, c);
            break;
        case 'fnPayback':
            i = fnPayback(t, r);
            break;
    }

    return smartRound(i);
}

function tr(s: number, c = 100) {
    return Math.round(s / c) * c;
}

function smartRound(e: number) {
    if (e < 50) {
        return Math.round(e);
    } else if (e < 100) {
        return tr(e, 5);
    } else if (e < 500) {
        return tr(e, 25);
    } else if (e < 1000) {
        return tr(e, 50);
    } else if (e < 5000) {
        return tr(e, 100);
    } else if (e < 10000) {
        return tr(e, 200);
    } else if (e < 100000) {
        return tr(e, 500);
    } else if (e < 500000) {
        return tr(e, 1000);
    } else if (e < 1000000) {
        return tr(e, 5000);
    } else if (e < 50000000) {
        return tr(e, 10000);
    } else if (e < 100000000) {
        return tr(e, 50000);
    } else {
        return tr(e, 100000);
    }
}

function fnLinear(e: number, t: number) {
    return t * e;
}

function fnQuadratic(e: number, t: number) {
    return t * e * e;
}

function fnCubic(e: number, t: number) {
    return t * e * e * e;
}

function fnExponential(e: number, t: number, s: number) {
    return t * Math.pow(s / 10, e);
}

function fnLogarithmic(e: number, t: number) {
    return t * Math.log2(e + 1);
}

function fnCompound(e: number, t: number, s: number) {
    const c = s / 100;
    return t * Math.pow(1 + c, e - 1);
}

function fnPayback(e: number, t: any) {
    const s = [0];
    for (let c = 1; c <= e; c++) {
        const r = s[c - 1];
        const i = getPrice(t, c);
        const S = t.profitBasic + t.profitFormulaK * (c - 1);
        const L = smartRound(r + i / S);
        s.push(L);
    }
    return s[e];
}

export type TImproveMode = 'profit' | 'price';

export function calculateBestSkill({
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
    let possibleSkills = [];
    for (const skill of allSKills) {
        if ((ignoredSkills ?? []).includes(skill.key)) continue;
        if (skill.profitBasic === 0) continue;

        const possibleSkill = getPossibleSkill({ skill, mySkills, level, balance, friends });
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

function getPossibleSkill({
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
    let currentSkill = mySkills[skill.key];
    let skillPrice;
    let skillProfit;

    if (currentSkill) {
        if (skill.maxLevel <= currentSkill.level) return null;

        if (typeof currentSkill.finishUpgradeDate === 'string') {
            currentSkill.finishUpgradeDate =
                new Date(currentSkill.finishUpgradeDate).getTime() / 1000;
        }
        if (
            typeof currentSkill.finishUpgradeDate === 'number' &&
            currentSkill.finishUpgradeDate > Date.now() / 1000
        ) {
            return null;
        }

        skillPrice = getPrice(skill, currentSkill.level + 1);
        const currentProfit = getProfit(skill, currentSkill.level);
        const nextProfit = getProfit(skill, currentSkill.level + 1);
        skillProfit = nextProfit - currentProfit;
    } else {
        skillPrice = getPrice(skill, 1);
        skillProfit = getProfit(skill, 1);
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
        } else if (
            matchedSkillLimit.requiredHeroLevel <= level &&
            matchedSkillLimit.requiredFriends <= friends
        ) {
            if (!matchedSkillLimit.requiredSkills) {
                isPossible = true;
            } else {
                for (const [reqSkill, reqLevel] of Object.entries(
                    matchedSkillLimit.requiredSkills,
                )) {
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

export function numberShort(value: number, roundValue = false) {
    if (Math.abs(value) < 1e3) {
        return value.toFixed(0);
    }

    let result;
    if (Math.abs(value) >= 1e3 && Math.abs(value) < 1e6) {
        result = value / 1e3;
        return `${
            roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10
        }K`;
    }

    if (Math.abs(value) >= 1e6 && Math.abs(value) < 1e9) {
        result = value / 1e6;
        return `${
            roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10
        }M`;
    }

    if (Math.abs(value) >= 1e9 && Math.abs(value) < 1e12) {
        result = value / 1e9;
        return `${
            roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10
        }B`;
    }

    if (Math.abs(value) >= 1e12) {
        result = value / 1e12;
        return `${
            roundValue || result % 1 === 0 ? Math.round(result) : Math.floor(result * 10) / 10
        }T`;
    }
}

export function calculateTapPower(
    perTap: number,
    energy: number,
    bonusChance: number,
    bonusMultiplier: number,
) {
    if (perTap > energy) {
        return 0;
    }

    if (perTap * bonusMultiplier <= energy) {
        const gain = Math.random() * 100 <= bonusChance;
        return gain ? perTap * bonusMultiplier : perTap;
    }

    return perTap;
}

export function calculateBet(level: number, mph: number, balance: number) {
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
        let currentMinBet = minBet();
        while (currentMaxBet > balance && currentMaxBet - currentMinBet >= currentMinBet) {
            currentMaxBet -= currentMinBet;
        }
        availBet = Math.max(currentMaxBet, currentMinBet);
    }

    return availBet;
}

export function getDelayByLevel(level: number) {
    const minDelay = 5;
    const maxDelay = 210;
    const maxLevel = 25;

    const delay = minDelay + ((maxDelay - minDelay) / (maxLevel - 1)) * (level - 1);

    return Math.round(random(delay - 1, delay + 1));
}

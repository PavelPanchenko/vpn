"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.seedPlans = seedPlans;
const client_1 = require("@prisma/client");
const prisma = new client_1.PrismaClient();
async function seedPlans() {
    const plans = [
        {
            code: 'trial',
            name: '3 дня бесплатно',
            description: 'Тестовый доступ на 3 дня',
            periodDays: 3,
            price: 0,
            currency: 'RUB',
            isTrial: true,
            active: true,
            legacy: false,
            availableFor: 'ALL',
        },
        {
            code: '1m_new',
            name: '1 месяц',
            description: '1 месяц доступа к VPN',
            periodDays: 30,
            price: 129,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: false,
            availableFor: 'NEW_USERS',
        },
        {
            code: '3m_new',
            name: '3 месяца',
            description: '3 месяца доступа к VPN',
            periodDays: 90,
            price: 349,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: false,
            availableFor: 'NEW_USERS',
        },
        {
            code: '6m_new',
            name: '6 месяцев',
            description: '6 месяцев доступа к VPN',
            periodDays: 180,
            price: 649,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: false,
            availableFor: 'NEW_USERS',
        },
        {
            code: '12m_new',
            name: '12 месяцев',
            description: '12 месяцев доступа к VPN',
            periodDays: 365,
            price: 1299,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: false,
            availableFor: 'NEW_USERS',
        },
        {
            code: '1m',
            name: '1 месяц',
            description: '1 месяц доступа к VPN',
            periodDays: 30,
            price: 99,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: true,
            availableFor: 'EXISTING_USERS',
        },
        {
            code: '3m',
            name: '3 месяца',
            description: '3 месяца доступа к VPN',
            periodDays: 90,
            price: 249,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: true,
            availableFor: 'EXISTING_USERS',
        },
        {
            code: '6m',
            name: '6 месяцев',
            description: '6 месяцев доступа к VPN',
            periodDays: 180,
            price: 449,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: true,
            availableFor: 'EXISTING_USERS',
        },
        {
            code: '12m',
            name: '12 месяцев',
            description: '12 месяцев доступа к VPN',
            periodDays: 365,
            price: 799,
            currency: 'RUB',
            isTrial: false,
            active: true,
            legacy: true,
            availableFor: 'EXISTING_USERS',
        },
    ];
    for (const plan of plans) {
        const existing = await prisma.plan.findUnique({ where: { code: plan.code } });
        if (!existing) {
            await prisma.plan.create({ data: plan });
        }
    }
}
//# sourceMappingURL=plans.seed.js.map
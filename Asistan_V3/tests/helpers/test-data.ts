export const TEST_BOSS_ID = 999999;
export const TEST_MARINA_ID = 444444;
export const TEST_CHAT_ID = "888888";

export const TEST_STAFF = [
  { telegramId: 111111, name: "Almira", department: "Dikishane", role: "Personnel", language: "ru" },
  { telegramId: 222222, name: "Natalya", department: "Dosemehane", role: "Personnel", language: "ru" },
  { telegramId: 333333, name: "Mehmet", department: "Karkas Uretimi", role: "Personnel", language: "ru" },
  { telegramId: 444444, name: "Marina", department: "Koordinator", role: "Coordinator", language: "ru", isMarina: true },
  { telegramId: 555555, name: "Ahmet", department: "Boyahane", role: "Personnel", language: "ru" },
];

let itemIdCounter = 1;

export function createTestOrder(overrides: Partial<any> = {}): any {
  const orderId = `SD-${String(itemIdCounter++).padStart(6, "0")}`;
  return {
    id: orderId,
    orderNumber: orderId,
    customerName: "Test Müşteri",
    items: [
      {
        id: `${orderId}_1`,
        product: "Каркас стола",
        department: "Karkas Uretimi",
        quantity: 5,
        details: "АХСАП, 120x80cm",
        source: "Production",
        status: "bekliyor",
        rowIndex: 9,
        ...overrides,
      },
    ],
    deliveryDate: "2026-05-01",
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

export function createMultiDeptOrder(): any {
  const orderId = `SD-${String(itemIdCounter++).padStart(6, "0")}`;
  return {
    id: orderId,
    orderNumber: orderId,
    customerName: "Marzhan",
    items: [
      {
        id: `${orderId}_1`,
        product: "Каркас стола",
        department: "Karkas Uretimi",
        quantity: 5,
        details: "АХСАП, 120x80cm",
        source: "Production",
        status: "bekliyor",
        rowIndex: 9,
      },
      {
        id: `${orderId}_2`,
        product: "Покраска стола",
        department: "Boyahane",
        quantity: 5,
        details: "Тёмный орех",
        source: "Production",
        status: "bekliyor",
        rowIndex: 10,
      },
      {
        id: `${orderId}_3`,
        product: "Пластиковая ручка",
        department: "Satialma",
        quantity: 20,
        details: "PP, чёрный",
        source: "External",
        status: "bekliyor",
        rowIndex: 11,
      },
      {
        id: `${orderId}_4`,
        product: "Подушка сиденья",
        department: "Dikishane",
        quantity: 5,
        details: "Ткань: велюр",
        source: "Stock",
        status: "bekliyor",
        rowIndex: 12,
        fabricDetails: { name: "Велюр синий", amount: 10, arrived: false },
      },
      {
        id: `${orderId}_5`,
        product: "Обивка спинки",
        department: "Dosemehane",
        quantity: 5,
        details: "Поролон + ткань",
        source: "Stock",
        status: "bekliyor",
        rowIndex: 13,
      },
    ],
    deliveryDate: "2026-05-01",
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

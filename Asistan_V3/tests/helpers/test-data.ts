export const TEST_BOSS_ID = 999999;
export const TEST_MARINA_ID = 444444;
export const TEST_CHAT_ID = "888888";

// Gercek personel listesi (yonetim calismasi belgesine uygun)
export const TEST_STAFF = [
  // Uretim
  { telegramId: 111111, name: "Bekbergen", department: "Karkas Uretimi", role: "Personnel", language: "ru" },
  { telegramId: 222222, name: "Valeri", department: "Metal Uretimi", role: "Personnel", language: "ru" },
  { telegramId: 333333, name: "Zhenis", department: "Mobilya Dekorasyon", role: "Personnel", language: "ru" },
  { telegramId: 444444, name: "Almira", department: "Dikishane", role: "Personnel", language: "ru" },
  { telegramId: 444445, name: "X", department: "Dikishane", role: "Personnel", language: "ru" },
  { telegramId: 555555, name: "Hasan", department: "Dosemehane", role: "Personnel", language: "ru" },
  { telegramId: 556001, name: "Zhagir", department: "Dosemehane", role: "Personnel", language: "ru" },
  { telegramId: 556002, name: "Aleksi", department: "Dosemehane", role: "Personnel", language: "ru" },
  { telegramId: 666666, name: "Zhanibek", department: "Boyahane", role: "Personnel", language: "ru" },
  // Satis
  { telegramId: 777001, name: "Aizhan", department: "Satis", role: "Personnel", language: "ru" },
  // Cikis
  { telegramId: 888001, name: "Nikita", department: "Paketleme", role: "Personnel", language: "ru" },
  { telegramId: 888002, name: "Bekir", department: "Sevkiyat", role: "Personnel", language: "ru" },
  // Yonetim
  { telegramId: 444444, name: "Marina", department: "Koordinator", role: "Coordinator", language: "ru", isMarina: true },
  { telegramId: 444444, name: "Marina", department: "Dis Satin Alma", role: "Coordinator", language: "ru", isMarina: true },
];

let itemIdCounter = 1;

export function createTestOrder(overrides: Partial<any> = {}): any {
  const orderId = `SD-${String(itemIdCounter++).padStart(6, "0")}`;
  return {
    id: orderId,
    orderNumber: orderId,
    customerName: "Test Musteri",
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
        product: "Метал рама",
        department: "Metal Uretimi",
        quantity: 5,
        details: "Стальной каркас",
        source: "Production",
        status: "bekliyor",
        rowIndex: 10,
      },
      {
        id: `${orderId}_3`,
        product: "Декор стола",
        department: "Mobilya Dekorasyon",
        quantity: 5,
        details: "Резьба, орнамент",
        source: "Production",
        status: "bekliyor",
        rowIndex: 11,
      },
      {
        id: `${orderId}_4`,
        product: "Покраска стола",
        department: "Boyahane",
        quantity: 5,
        details: "Тёмный орех",
        source: "Production",
        status: "bekliyor",
        rowIndex: 12,
      },
      {
        id: `${orderId}_5`,
        product: "Подушка сиденья",
        department: "Dikishane",
        quantity: 5,
        details: "Ткань: велюр",
        source: "Stock",
        status: "bekliyor",
        rowIndex: 13,
        fabricDetails: { name: "Велюр синий", amount: 10, arrived: false },
      },
      {
        id: `${orderId}_6`,
        product: "Обивка спинки",
        department: "Dosemehane",
        quantity: 5,
        details: "Поролон + ткань",
        source: "Stock",
        status: "bekliyor",
        rowIndex: 14,
      },
    ],
    deliveryDate: "2026-05-01",
    status: "new",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

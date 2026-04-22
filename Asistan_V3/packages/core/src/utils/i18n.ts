/**
 * i18n - İkidilli Çeviri Modülü (Türkçe / Rusça)
 *
 * - Tüm personel (çalışanlar) → Rusça (ru)
 * - Barış Bey (patron) → Türkçe (tr)
 * - Marina Hanım (süpervizör) → Rusça (ru)
 */

export type Language = "tr" | "ru";

const translations: Record<string, Record<Language, string>> = {
  welcome_boss: {
    tr: "✨ *Sandaluci Yönetim Paneli Aktif.* 👋\n\nSisteme tam yetkiyle bağlandınız. Komutlarınızı bekliyorum, Barış Bey.\n\n🛠️ *Komut Listesi:*\n📌 /ajanda - Günlük plan\n👥 /personel - Ekip yönetimi\n📦 /durum - Üretim raporu\n📝 /kayit - Personel ekle\n🗑️ /sil - Personel çıkar\n📋 /takip - İş takip\n🛠️ /dev - Geliştirici Modu\n🧽 /temizlik - Verileri temizle",
    ru: "✨ *Панель управления Sandaluci активна.* 👋\n\nВы подключены с полными правами. Жду ваших команд.\n\n🛠️ *Список команд:*\n📌 /ajanda - Расписание\n👥 /personel - Персонал\n📦 /durum - Статус\n📝 /kayit - Добавить\n🗑️ /sil - Удалить",
  },
  welcome_coordinator: {
    tr: "✨ *Genel Koordinatör Paneli Aktif.* 🧭\n\nHoş geldiniz. Üretim dağıtım ve personel atamalarını buradan yönetebilirsiniz.\n\n🛠️ *Yetkileriniz:*\n📌 /durum - Üretim raporu\n📋 /takip - İş takip\n🧵 Personel Atama (Otomatik)",
    ru: "✨ *Панель Генерального Координатора активна.* 🧭\n\nДобро пожаловать. Здесь вы можете управлять распределением производства и назначением персонала.\n\n🛠️ *Ваши полномочия:*\n📌 /durum - Отчет о производстве\n📋 /takip - Отслеживание работ\n🧵 Назначение персонала (Автоматически)",
  },
  welcome_staff: {
    tr: "✅ *Sandaluci Personel Sistemi Aktif.* 👋\n\nHoş geldiniz {name}. *{department}* bölümü için yetkilendirildiniz.\n\nBilgi almak için /durum yazabilirsiniz.",
    ru: "✅ *Система персонала Sandaluci активна.* 👋\n\nДобро пожаловать, {name}. Вы авторизованы для отдела *{department}*.\n\nДля получения информации напишите /durum.",
  },
  welcome_guest: {
    tr: "⚠️ *Sandaluci Özel Personel Sistemi* 🔒\n\nBu bot sadece şirket içi kullanım içindir. Erişim yetkiniz bulunmamaktadır.\n\nSisteme kayıt olmak için lütfen yöneticinizle 🆔 Telegram ID'nizi paylaşın:\n`{id}`",
    ru: "⚠️ *Частная система персонала Sandaluci* 🔒\n\nЭтот бот предназначен только для внутреннего использования. У вас нет прав доступа.\n\nДля регистрации в системе, пожалуйста, передайте свой 🆔 Telegram ID администратору:\n`{id}`",
  },
  access_denied: {
    tr: "🔒 Bu komuta erişim yetkiniz bulunmamaktadır.",
    ru: "🔒 У вас нет доступа к этой команде.",
  },
  status_bekliyor: { tr: "Bekliyor", ru: "Ожидание" },
  status_uretimde: { tr: "Üretimde", ru: "В производстве" },
  status_boyada: { tr: "Boyada", ru: "На покраске" },
  status_dikiste: { tr: "Dikiş'te", ru: "На шитье" },
  status_dosemede: { tr: "Döşeme'de", ru: "На обивке" },
  status_hazir: { tr: "Hazır", ru: "Готово" },
  status_sevk_edildi: { tr: "Sevk Edildi", ru: "Отправлено" },
  status_arsivlendi: { tr: "Arşivlendi", ru: "В архиве" },
  btn_start_production: { tr: "⚙️ Üretime Başlat", ru: "⚙️ Начать производство" },
  btn_send_to_paint: { tr: "🎨 Boya'ya Gönder", ru: "🎨 На покраску" },
  btn_send_to_sewing: { tr: "🧵 Dikiş'e Gönder", ru: "🧵 На шитьё" },
  btn_send_to_upholstery: { tr: "🪑 Döşeme'ye Gönder", ru: "🪑 На обивку" },
  btn_ready: { tr: "✅ Hazır", ru: "✅ Готово" },
  btn_refresh: { tr: "🔄 Listeyi Yenile", ru: "🔄 Обновить список" },
  btn_archive: { tr: "🏁 Bitenleri Arşivle", ru: "🏁 Архивировать" },
  notification_new_order: {
    tr: "📦 *YENİ İŞ EMRİ*\n\nMüşteri: {customer}\nÜrün: {product}\nAdet: {quantity}\nBirim: {department}",
    ru: "📦 *НОВЫЙ ЗАКАЗ*\n\nКлиент: {customer}\nИзделие: {product}\nКоличество: {quantity}\nОтдел: {department}",
  },
  notification_status_updated: {
    tr: "Durum {status} olarak güncellendi.",
    ru: "Статус обновлён: {status}.",
  },
  dept_karkas: { tr: "Karkas Üretimi", ru: "Производство каркаса" },
  dept_metal: { tr: "Metal Üretimi", ru: "Металлопроизводство" },
  dept_mobilya: { tr: "Mobilya Dekorasyon", ru: "Мебельный декор" },
  dept_sewing: { tr: "Dikişhane", ru: "Швейный цех" },
  dept_upholstery: { tr: "Döşemehane", ru: "Обивочный цех" },
  dept_paint: { tr: "Boyahane", ru: "Покрасочный цех" },
  dept_purchasing: { tr: "Satınalma", ru: "Закупки" },
  dept_fabric: { tr: "Kumaş", ru: "Ткань" },
  role_boss: { tr: "Patron", ru: "Босс" },
  role_coordinator: { tr: "Genel Koordinatör", ru: "Генеральный координатор" },
  role_staff: { tr: "Personel", ru: "Персонал" },
  fabric_purchase_reminder: {
    tr: "🧶 <b>Kumaş / Dış Alım Hatırlatma</b>\n\nAşağıdaki kalemlerin durumu hakkında bilgi verir misiniz?",
    ru: "🧶 <b>Напоминание: Ткань / Закупки</b>\n\nПожалуйста, сообщите статус следующих позиций:",
  },
  btn_fabric_ok: { tr: "✅ Geldi", ru: "✅ Пришла" },
  btn_fabric_fail: { tr: "❌ Gelmedi", ru: "❌ Не пришла" },
  btn_fabric_ordered: { tr: "📦 Sipariş Verildi", ru: "📦 Заказ оформлен" },
  fabric_ok_msg: {
    tr: "✅ Kumaş onayı verildi. Birimlere iş emirleri iletilecek.",
    ru: "✅ Ткань подтверждена. Заказы будут отправлены в отделы.",
  },
  fabric_fail_msg: {
    tr: "⚠️ Kumaş henüz gelmediği için üretim beklemeye alındı.",
    ru: "⚠️ Производство приостановлено, так как ткань ещё не поступила.",
  },
};

export function t(
  key: string,
  lang: Language = "ru",
  params?: Record<string, string>,
): string {
  const entry = translations[key];
  if (!entry) return key;

  let text = entry[lang] || entry["tr"];

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }
  return text;
}

export function getUserLanguage(role: string): Language {
  return role === "boss" ? "tr" : "ru";
}

export function translateDepartment(deptName: string, lang: Language = "ru"): string {
  const normalized = deptName.toLowerCase();
  if (normalized.includes("karkas")) return t("dept_karkas", lang);
  if (normalized.includes("metal")) return t("dept_metal", lang);
  if (normalized.includes("mobilya") || normalized.includes("dekorasyon")) return t("dept_mobilya", lang);
  if (normalized.includes("dikiş")) return t("dept_sewing", lang);
  if (normalized.includes("döşeme")) return t("dept_upholstery", lang);
  if (normalized.includes("boya")) return t("dept_paint", lang);
  if (normalized.includes("satın") || normalized.includes("procurement")) return t("dept_purchasing", lang);
  if (normalized === "kumaş") return t("dept_fabric", lang);
  return deptName;
}

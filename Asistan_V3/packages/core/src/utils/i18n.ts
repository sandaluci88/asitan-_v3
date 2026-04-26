/**
 * i18n - İkidilli Çeviri Modülü (Türkçe / Rusça)
 *
 * - Tüm personel (çalışanlar) → Rusça (ru)
 * - Barış Bey (patron) → Türkçe (tr)
 * - Marina Hanım (süpervizör) → Rusça (ru)
 */

export type Language = "tr" | "ru";

const translations: Record<string, Record<Language, string>> = {
  // --- PDF Labels (Tum personel Rusca okuyacak) ---
  customer_label: { tr: "Müşteri", ru: "Клиент" },
  order_label: { tr: "Sipariş No", ru: "№ заказа" },
  delivery_label: { tr: "Teslim Tarihi", ru: "Срок сдачи" },
  product_label: { tr: "Ürün", ru: "Изделие" },
  dept_label: { tr: "Departman", ru: "Отдел" },
  worker_label: { tr: "Personel", ru: "Исполнитель" },
  details_label: { tr: "Detaylar", ru: "Детали" },
  pdf_date: { tr: "Tarih", ru: "Дата" },
  pdf_footer: { tr: "Sandaluci Mobilya — Üretim İş Emri", ru: "Sandaluci Mobilya — Производственный заказ" },
  pdf_marina_header: { tr: "SANDALUCİ ÜRETİM ÖZETİ", ru: "СВОДКА ПРОИЗВОДСТВА SANDALUCI" },
  pdf_table_product: { tr: "Ürün", ru: "Изделие" },
  pdf_table_details: { tr: "Detaylar", ru: "Детали" },
  pdf_table_quantity: { tr: "Adet", ru: "Кол-во" },
  pdf_no_image: { tr: "Resim yok", ru: "Нет фото" },
  pdf_no_image_error: { tr: "Resim yüklenemedi", ru: "Ошибка загрузки" },
  pdf_photo_col: { tr: "Fotoğraf", ru: "Фото" },
  pdf_fabric_title: { tr: "Kumaş Sipariş", ru: "ЗАКАЗ ТКАНИ" },
  pdf_fabric_name: { tr: "Kumaş:", ru: "Ткань:" },
  pdf_fabric_amount: { tr: "Miktar:", ru: "Количество:" },
  system_coordinator_title: { tr: "Genel Koordinatör Raporu", ru: "Отчёт генерального координатора" },
  summary_title: { tr: "Üretim Özeti", ru: "Сводка производства" },
  stock_delivery: { tr: "Stoktan Teslim:", ru: "Со склада:" },
  production_entry: { tr: "Üretime Girenler:", ru: "В производстве:" },
  external_purchase: { tr: "Dış Alım:", ru: "Внешние закупки:" },
  coordinator_note: { tr: "Koordinatör Notu: Kontroller yapıldı.", ru: "Примечание координатора: проверка выполнена." },
  report_title: { tr: "ÜRETİM RAPORU", ru: "ОТЧЁТ О ПРОИЗВОДСТВЕ" },
  dist_not_assigned: { tr: "Atanmadı", ru: "Не назначен" },
  followup_summary_marina: { tr: "Takip Özeti", ru: "Сводка контроля: {count} позиций" },
  pdf_caption: { tr: "İş Emri Dosyası", ru: "Заказ на производство" },
  // --- Callback Handler Labels ---
  cb_select_worker: { tr: "Personel seçin:", ru: "— выберите исполнителя:" },
  cb_select_worker_hint: { tr: "Listeden isim seçin.", ru: "Выберите имя из списка." },
  cb_no_staff: { tr: "Kayıtlı personel yok.", ru: "В отделе нет зарегистрированных сотрудников." },
  cb_back: { tr: "Geri", ru: "Назад" },
  cb_draft_not_found: { tr: "Taslak bulunamadı.", ru: "Черновик не найден или истёк." },
  cb_worker_assigned: { tr: "atanmış.", ru: "назначен(а)." },
  cb_pdf_sent: { tr: "PDF gönderildi.", ru: "PDF отправлен." },
  cb_all_distributed: { tr: "Tüm departmanlar dağıtıldı.", ru: "Все отделы распределены" },
  cb_launch_production: { tr: "ÜRETİMİ BAŞLAT", ru: "ЗАПУСТИТЬ ПРОИЗВОДСТВО" },
  cb_cancel: { tr: "İptal", ru: "Отменить" },
  cb_split: { tr: "Bölüştür:", ru: "Разделить:" },
  cb_production_starting: { tr: "Üretim başlatılıyor...", ru: "Производство запускается..." },
  cb_assign_first: { tr: "Önce personel atayın:", ru: "Сначала назначьте исполнителей:" },
  cb_order_rejected: { tr: "Sipariş reddedildi.", ru: "Заказ отменён." },
  // --- End Labels ---
  welcome_boss: {
    tr: "✨ *Sandaluci Yönetim Paneli Aktif.* 👋\n\nSisteme tam yetkiyle bağlandınız. Komutlarınızı bekliyorum, Barış Bey.\n\n🛠️ *Komut Listesi:*\n📌 /ajanda - Günlük plan\n👥 /personel - Ekip yönetimi\n📦 /durum - Üretim raporu\n📝 /kayit - Personel ekle\n🗑️ /sil - Personel çıkar\n📋 /takip - İş takip\n🛠️ /dev - Geliştirici Modu\n🧽 /temizlik - Verileri temizle",
    ru: "✨ *Панель управления Sandaluci активна.* 👋\n\nВы подключены с полными правами. Жду ваших команд.\n\n🛠️ *Список команд:*\n📌 /ajanda - Расписание\n👥 /personel - Персонал\n📦 /durum - Статус\n📝 /kayit - Добавить\n🗑️ /sil - Удалить",
  },
  welcome_coordinator: {
    tr: "✨ *Genel Koordinatör Paneli Aktif.* 🧭\n\nHoş geldiniz. Üretim dağıtım ve personel atamalarını buradan yönetebilirsiniz.\n\n🛠️ *Yetkileriniz:*\n📌 /durum - Üretim raporu\n📋 /takip - İş takip\n🧵 Personel Atama (Otomatik)",
    ru: "✨ *Панель генерального координатора активна.* 🧭\n\nДобро пожаловать. Здесь вы можете управлять распределением производства и назначением персонала.\n\n🛠️ *Ваши полномочия:*\n📌 /durum - Отчёт о производстве\n📋 /takip - Отслеживание работ\n🧵 Назначение персонала (автоматически)",
  },
  welcome_staff: {
    tr: "✅ *Sandaluci Personel Sistemi Aktif.* 👋\n\nHoş geldiniz {name}. *{department}* bölümü için yetkilendirildiniz.\n\nBilgi almak için /durum yazabilirsiniz.",
    ru: "✅ *Система персонала Sandaluci активна.* 👋\n\nДобро пожаловать, {name}. Вы назначены в отдел *{department}*.\n\nДля информации напишите /durum.",
  },
  welcome_guest: {
    tr: "⚠️ *Sandaluci Özel Personel Sistemi* 🔒\n\nBu bot sadece şirket içi kullanım içindir. Erişim yetkiniz bulunmamaktadır.\n\nSisteme kayıt olmak için lütfen yöneticinizle 🆔 Telegram ID'nizi paylaşın:\n`{id}`",
    ru: "⚠️ *Внутренняя система персонала Sandaluci* 🔒\n\nЭтот бот предназначен только для сотрудников. У вас нет доступа.\n\nДля регистрации передайте свой 🆔 Telegram ID администратору:\n`{id}`",
  },
  access_denied: {
    tr: "🔒 Bu komuta erişim yetkiniz bulunmamaktadır.",
    ru: "🔒 У вас нет доступа к этой команде.",
  },
  status_bekliyor: { tr: "Bekliyor", ru: "Ожидание" },
  status_uretimde: { tr: "Üretimde", ru: "В производстве" },
  status_boyada: { tr: "Boyada", ru: "На покраске" },
  status_dikiste: { tr: "Dikiş'te", ru: "В швейном цехе" },
  status_dosemede: { tr: "Döşeme'de", ru: "В обивочном цехе" },
  status_hazir: { tr: "Hazır", ru: "Готово" },
  status_sevk_edildi: { tr: "Sevk Edildi", ru: "Отправлено" },
  status_arsivlendi: { tr: "Arşivlendi", ru: "В архиве" },
  btn_start_production: { tr: "⚙️ Üretime Başlat", ru: "⚙️ Начать производство" },
  btn_send_to_paint: { tr: "🎨 Boya'ya Gönder", ru: "🎨 На покраску" },
  btn_send_to_sewing: { tr: "🧵 Dikiş'e Gönder", ru: "🧵 В швейный цех" },
  btn_send_to_upholstery: { tr: "🪑 Döşeme'ye Gönder", ru: "🪑 В обивочный цех" },
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
  dept_metal: { tr: "Metal Üretimi", ru: "Производство металлоконструкций" },
  dept_mobilya: { tr: "Mobilya Dekorasyon", ru: "Мебельный декор" },
  dept_sewing: { tr: "Dikişhane", ru: "Швейный цех" },
  dept_upholstery: { tr: "Döşemehane", ru: "Обивочный цех" },
  dept_paint: { tr: "Boyahane", ru: "Покрасочный цех" },
  dept_purchasing: { tr: "Satınalma", ru: "Закупки" },
  dept_fabric: { tr: "Kumaş", ru: "Ткань" },
  role_boss: { tr: "Patron", ru: "Руководитель" },
  role_coordinator: { tr: "Genel Koordinatör", ru: "Генеральный координатор" },
  role_staff: { tr: "Personel", ru: "Персонал" },
  fabric_purchase_reminder: {
    tr: "🧶 <b>Kumaş / Dış Alım Hatırlatma</b>\n\nAşağıdaki kalemlerin durumu hakkında bilgi verir misiniz?",
    ru: "🧶 <b>Напоминание: ткань / закупки</b>\n\nПожалуйста, сообщите статус следующих позиций:",
  },
  btn_fabric_ok: { tr: "✅ Geldi", ru: "✅ Поступила" },
  btn_fabric_fail: { tr: "❌ Gelmedi", ru: "❌ Не поступила" },
  btn_fabric_ordered: { tr: "📦 Sipariş Verildi", ru: "📦 Заказ оформлен" },
  fabric_ok_msg: {
    tr: "✅ Kumaş onayı verildi. Birimlere iş emirleri iletilecek.",
    ru: "✅ Ткань подтверждена. Заказы будут направлены в цеха.",
  },
  fabric_fail_msg: {
    tr: "⚠️ Kumaş henüz gelmediği için üretim beklemeye alındı.",
    ru: "⚠️ Производство приостановлено: ткань ещё не поступила.",
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

const normalizeTrForMatch = (s: string) =>
  s.toLowerCase()
    .replace(/ü/g, "u").replace(/ö/g, "o").replace(/ş/g, "s").replace(/ç/g, "c")
    .replace(/ğ/g, "g").replace(/ı/g, "i");

export function translateDepartment(deptName: string, lang: Language = "ru"): string {
  const n = normalizeTrForMatch(deptName);
  if (n.includes("karkas")) return t("dept_karkas", lang);
  if (n.includes("metal")) return t("dept_metal", lang);
  if (n.includes("mobilya") || n.includes("dekorasyon")) return t("dept_mobilya", lang);
  if (n.includes("dikis") || n.includes("sewing") || n.includes("sve")) return t("dept_sewing", lang);
  if (n.includes("doseme") || n.includes("upholstery") || n.includes("obiv")) return t("dept_upholstery", lang);
  if (n.includes("boya") || n.includes("paint") || n.includes("pokras")) return t("dept_paint", lang);
  if (n.includes("satin") || n.includes("sati") || n.includes("procurement") || n.includes("zakup")) return t("dept_purchasing", lang);
  if (n.includes("kumas") || n.includes("fabric") || n.includes("tkan")) return t("dept_fabric", lang);
  return deptName;
}

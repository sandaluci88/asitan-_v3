/**
 * i18n - İkidilli Çeviri Modülü (Türkçe / Rusça)
 *
 * Kural:
 * - Tüm personel (çalışanlar) → Rusça (ru)
 * - Barış Bey (patron) → Türkçe (tr)
 * - Marina Hanım (süpervizör) → Rusça (ru)
 */

export type Language = "tr" | "ru";

const translations: Record<string, Record<Language, string>> = {
  // === Genel ===
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
  registration_invite: {
    tr: "Sizi personel listemizde bulamadık. 🧐\n\nEğer ekibe yeni katıldıysanız veya telefon numaranız güncel değilse, lütfen Barış Bey ile iletişime geçin.",
    ru: "Мы не нашли вас в нашем списке персонала. 🧐\n\nЕсли вы новичок в команде или ваш номер телефона не актуален, пожалуйста, свяжитесь с руководством для обновления данных.",
  },
  access_denied: {
    tr: "🔒 Bu komuta erişim yetkiniz bulunmamaktadır.",
    ru: "🔒 У вас нет доступа к этой команде.",
  },

  // === Takip Paneli ===
  tracking_title: {
    tr: "📋 *Aktif İş Takip Paneli*",
    ru: "📋 *Панель отслеживания работ*",
  },
  tracking_empty: {
    tr: "✨ Şu an aktif takip gerektiren bir iş bulunmuyor.",
    ru: "✨ В данный момент нет активных работ для отслеживания.",
  },
  tracking_boss_only: {
    tr: "🔒 Takip paneline sadece yöneticiler erişebilir.",
    ru: "🔒 Панель отслеживания доступна только руководству.",
  },
  tracking_actions_hint: {
    tr: "\nDetaylı işlem yapmak için yukarıdaki butonları kullanabilirsiniz:",
    ru: "\nИспользуйте кнопки выше для управления:",
  },
  tracking_refreshed: {
    tr: "Liste güncellendi.",
    ru: "Список обновлён.",
  },

  // === Statüler ===
  status_bekliyor: {
    tr: "Bekliyor",
    ru: "Ожидание",
  },
  status_uretimde: {
    tr: "Üretimde",
    ru: "В производстве",
  },
  status_boyada: {
    tr: "Boyada",
    ru: "На покраске",
  },
  status_dikiste: {
    tr: "Dikiş'te",
    ru: "На шитье",
  },
  status_dosemede: {
    tr: "Döşeme'de",
    ru: "На обивке",
  },
  status_hazir: {
    tr: "Hazır",
    ru: "Готово",
  },
  status_sevk_edildi: {
    tr: "Sevk Edildi",
    ru: "Отправлено",
  },
  status_arsivlendi: {
    tr: "Arşivlendi",
    ru: "В архиве",
  },

  // === Butonlar ===
  btn_start_production: {
    tr: "⚙️ Üretime Başlat",
    ru: "⚙️ Начать производство",
  },
  btn_send_to_paint: {
    tr: "🎨 Boya'ya Gönder",
    ru: "🎨 На покраску",
  },
  btn_send_to_sewing: {
    tr: "🧵 Dikiş'e Gönder",
    ru: "🧵 На шитьё",
  },
  btn_send_to_upholstery: {
    tr: "🪑 Döşeme'ye Gönder",
    ru: "🪑 На обивку",
  },
  btn_ready: {
    tr: "✅ Hazır",
    ru: "✅ Готово",
  },
  btn_refresh: {
    tr: "🔄 Listeyi Yenile",
    ru: "🔄 Обновить список",
  },
  btn_archive: {
    tr: "🏁 Bitenleri Arşivle",
    ru: "🏁 Архивировать",
  },
  btn_share_phone: {
    tr: "📱 Telefon Numaramı Paylaş",
    ru: "📱 Поделиться номером телефона",
  },

  // === Bildirimler (Personel) ===
  notification_new_order: {
    tr: "📦 *YENİ İŞ EMRİ*\n\nMüşteri: {customer}\nÜrün: {product}\nAdet: {quantity}\nBirim: {department}",
    ru: "📦 *НОВЫЙ ЗАКАЗ*\n\nКлиент: {customer}\nИзделие: {product}\nКоличество: {quantity}\nОтдел: {department}",
  },
  notification_status_updated: {
    tr: "Durum {status} olarak güncellendi.",
    ru: "Статус обновлён: {status}.",
  },

  // === Sipariş Dağıtım Raporu ===
  distribution_complete: {
    tr: "🔔 Sipariş dağıtım işlemleri tamamlandı.",
    ru: "🔔 Распределение заказов завершено.",
  },
  auto_depts_distributed: {
    tr: "✅ *Karkas ve Diğer Otomatik Birimler Dağıtıldı.*",
    ru: "✅ *Каркас и другие автоматические отделы распределены.*",
  },

  // === Kayıt / Silme ===
  staff_registered: {
    tr: "✅ Personel başarıyla kaydedildi.",
    ru: "✅ Сотрудник успешно зарегистрирован.",
  },
  staff_removed: {
    tr: "✅ Personel başarıyla silindi.",
    ru: "✅ Сотрудник успешно удалён.",
  },

  // === Otomatik Takip (Follow-Up) ===
  followup_question: {
    tr: "📋 *Durum Sorgusu*\n\nMüşteri: *{customer}*\nÜrün: {product}\nAdet: {quantity}\n\nBu sipariş bitti mi?",
    ru: "📋 *Проверка статуса*\n\nКлиент: *{customer}*\nИзделие: {product}\nКоличество: {quantity}\n\nЭтот заказ готов?",
  },
  btn_yes_done: {
    tr: "✅ Evet, bitti",
    ru: "✅ Да, готово",
  },
  btn_no_ongoing: {
    tr: "⏳ Hayır, devam ediyor",
    ru: "⏳ Нет, в процессе",
  },
  followup_noted_done: {
    tr: "✅ Teşekkürler! Sipariş tamamlandı olarak işaretlendi.",
    ru: "✅ Спасибо! Заказ отмечен как выполненный.",
  },
  followup_noted_ongoing: {
    tr: "⏳ Tamam, 3 gün sonra tekrar soracağım.",
    ru: "⏳ Хорошо, спрошу снова через 3 дня.",
  },
  followup_paint_sent: {
    tr: "🎨 Boya bölümüne iş emri otomatik gönderildi.",
    ru: "🎨 Заказ автоматически отправлен в покрасочный отдел.",
  },
  // === Departmanlar ===
  dept_karkas: {
    tr: "Karkas Üretimi",
    ru: "Производство каркаса",
  },
  dept_metal: {
    tr: "Metal Üretimi",
    ru: "Металлопроизводство",
  },
  dept_mobilya: {
    tr: "Mobilya Dekorasyon",
    ru: "Мебельный декор",
  },
  dept_sewing: {
    tr: "Dikişhane",
    ru: "Швейный цех",
  },
  dept_upholstery: {
    tr: "Döşemehane",
    ru: "Обивочный цех",
  },
  dept_paint: {
    tr: "Boyahane",
    ru: "Покрасочный цех",
  },
  dept_purchasing: {
    tr: "Satınalma",
    ru: "Закупки",
  },

  followup_summary_marina: {
    tr: "📊 *Takip Özeti*\n\n{summary}",
    ru: "📊 *Сводка отслеживания*\n\n{summary}",
  },

  // === Raporlama ve PDF Etiketleri ===
  report_title: {
    tr: "📊 *SİPARİŞ DAĞITIM RAPORU*",
    ru: "📊 *ОТЧЕТ О РАСПРЕДЕЛЕНИИ ЗАКАЗОВ*",
  },
  customer_label: {
    tr: "Müşteri",
    ru: "Клиент",
  },
  order_label: {
    tr: "Sipariş",
    ru: "Заказ",
  },
  delivery_label: {
    tr: "Termin",
    ru: "Срок",
  },
  product_label: {
    tr: "Ürün",
    ru: "Изделие",
  },
  dept_label: {
    tr: "Birim",
    ru: "Отдел",
  },
  worker_label: {
    tr: "Görevli",
    ru: "Ответственный",
  },
  details_label: {
    tr: "Detay",
    ru: "Детали",
  },
  pdf_header: {
    tr: "ÜRETİM İŞ EMRİ / ЗАКАЗ НА ПРОИЗВОДСТВО",
    ru: "ЗАКАЗ НА ПРОИЗВОДСТВО",
  },
  pdf_footer: {
    tr: "Sandaluci Akıllı Üretim Koordinasyon Sistemi tarafından oluşturulmuştur.",
    ru: "Создано интеллектуальной системой координации Sandaluci.",
  },
  pdf_no_image: {
    tr: "GÖRSEL YOK",
    ru: "НЕТ ФОТО",
  },
  pdf_customer: {
    tr: "MÜŞTERİ / КЛИЕНТ",
    ru: "КЛИЕНТ",
  },
  pdf_date: {
    tr: "TARİH / ДАТА",
    ru: "ДАТА",
  },
  pdf_table_photo: {
    tr: "FOTO / ФОТО",
    ru: "ФОТО",
  },
  pdf_table_product: {
    tr: "ÜRÜN / ПРОДУКТ",
    ru: "ИЗДЕЛИЕ",
  },
  pdf_table_quantity: {
    tr: "ADET / КОЛ-ВО",
    ru: "КОЛ-ВО",
  },
  pdf_table_details: {
    tr: "DETAYLAR / ДЕТАЛИ",
    ru: "ДЕТАЛИ",
  },
  dist_not_assigned: {
    tr: "⌛ Atama Bekliyor",
    ru: "⌛ Ожидает назначения",
  },
  dist_complete_note: {
    tr: "✅ _Tüm birimlere iş emirleri iletildi._",
    ru: "✅ _Заказы отправлены во все отделы._",
  },
  summary_title: {
    tr: "📦 *Sipariş Koordinasyon Özeti*",
    ru: "📦 *Сводная координация заказа*",
  },
  stock_delivery: {
    tr: "🏬 *STOKTAN TESLİM:*",
    ru: "🏬 *ИЗ НАЛИЧИЯ (СО СКЛАДА):*",
  },
  production_entry: {
    tr: "🏭 *ÜRETİME GİRECEK:*",
    ru: "🏭 *В ПРОИЗВОДСТВО:*",
  },
  external_purchase: {
    tr: "🛒 *DIŞ ALIM / TEDARİK:*",
    ru: "🛒 *ВНЕШНЯЯ ЗАКУПКА / СНАБЖЕНИЕ:*",
  },
  coordinator_note: {
    tr: "🧭 _Ayça koordinasyon planını hazırladı._",
    ru: "🧭 _Айча подготовила план координации._",
  },
  fabric_check_title: {
    tr: "🧶 <b>Kumaş Kontrolü</b>\n\nMüşteri: {customer}\nÜrün: {product}{fabricInfo}\n\nKumaş depoya geldi mi?",
    ru: "🧶 <b>Проверка ткани</b>\n\nКлиент: {customer}\nИзделие: {product}{fabricInfo}\n\nТкань поступила на склад?",
  },
  btn_fabric_ok: {
    tr: "✅ Geldi",
    ru: "✅ Пришла",
  },
  btn_fabric_fail: {
    tr: "❌ Gelmedi",
    ru: "❌ Не пришла",
  },
  fabric_ok_msg: {
    tr: "✅ Kumaş onayı verildi. Birimlere iş emirleri iletilecek.",
    ru: "✅ Ткань подтверждена. Заказы будут отправлены в отделы.",
  },
  fabric_fail_msg: {
    tr: "⚠️ Kumaş henüz gelmediği için üretim beklemeye alındı.",
    ru: "⚠️ Производство приостановлено, так как ткань ещё не поступила.",
  },
  pdf_marina_header: {
    tr: "SİPARİŞ ÖZET RAPORU / СВОДНЫЙ ОТЧЕТ ПО ЗАКАЗУ",
    ru: "СВОДНЫЙ ОТЧЕТ ПО ЗАКАЗУ",
  },
  system_coordinator_title: {
    tr: "SİSTEM KOORDİNATÖRÜ / КООРДИНАТОР СИСТЕМЫ",
    ru: "КООРДИНАТОР СИСТЕМЫ",
  },
  dept_fabric: {
    tr: "Kumaş",
    ru: "Ткань",
  },
  role_boss: {
    tr: "Patron",
    ru: "Босс",
  },
  role_coordinator: {
    tr: "Genel Koordinatör",
    ru: "Генеральный координатор",
  },
  role_staff: {
    tr: "Personel",
    ru: "Персонал",
  },

  // === Kumaş & Dış Alım Hatırlatma ===
  fabric_purchase_reminder: {
    tr: "🧶 <b>Kumaş / Dış Alım Hatırlatma</b>\n\nAşağıdaki kalemlerin durumu hakkında bilgi verir misiniz?",
    ru: "🧶 <b>Напоминание: Ткань / Закупки</b>\n\nПожалуйста, сообщите статус следующих позиций:",
  },
  fabric_purchase_item: {
    tr: "\n\n{num}. <b>{customer}</b> — {product}\n   Adet: {quantity} | Departman: {department}{fabricInfo}",
    ru: "\n\n{num}. <b>{customer}</b> — {product}\n   Кол-во: {quantity} | Отдел: {department}{fabricInfo}",
  },
  btn_fabric_arrived: {
    tr: "✅ Geldi",
    ru: "✅ Пришла",
  },
  btn_fabric_not_arrived: {
    tr: "❌ Gelmedi",
    ru: "❌ Не пришла",
  },
  btn_fabric_ordered: {
    tr: "📦 Sipariş Verildi",
    ru: "📦 Заказ оформлен",
  },
  fabric_arrived_msg: {
    tr: "✅ Kumaş/dış alım <b>geldi</b> olarak kaydedildi. İş emirleri iletilecek.",
    ru: "✅ Отмечено как <b>полученное</b>. Заказы будут отправлены в отделы.",
  },
  fabric_not_arrived_msg: {
    tr: "⏳ Anlaşıldı. Yarın tekrar hatırlatacağım.",
    ru: "⏳ Понятно. Напомню завтра.",
  },
  fabric_ordered_msg: {
    tr: "📦 Sipariş verildi olarak kaydedildi. Takibe alındı.",
    ru: "📦 Отмечено как «заказ оформлен». Оставлено на контроле.",
  },
};

/**
 * Çeviri fonksiyonu
 * @param key - Çeviri anahtarı
 * @param lang - Dil kodu ("tr" | "ru")
 * @param params - Opsiyonel parametreler ({name}, {department} vb.)
 */
export function t(
  key: string,
  lang: Language = "ru",
  params?: Record<string, string>,
): string {
  const entry = translations[key];
  if (!entry) {
    console.warn(`⚠️ i18n: Missing translation key "${key}"`);
    return key;
  }

  let text = entry[lang] || entry["tr"]; // Fallback: Türkçe

  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replace(new RegExp(`\\{${k}\\}`, "g"), v);
    }
  }

  return text;
}

/**
 * Kullanıcının dilini belirle
 * Boss → "tr", Herkes → "ru"
 */
export function getUserLanguage(role: string): Language {
  return role === "boss" ? "tr" : "ru";
}
/**
 * Departman isimlerini yerelleştiren yardımcı fonksiyon
 */
export function translateDepartment(
  deptName: string,
  lang: Language = "ru",
): string {
  const normalized = deptName.toLowerCase();

  if (normalized.includes("karkas")) return t("dept_karkas", lang);
  if (normalized.includes("metal")) return t("dept_metal", lang);
  if (normalized.includes("mobilya") || normalized.includes("dekorasyon"))
    return t("dept_mobilya", lang);
  if (normalized.includes("dikiş")) return t("dept_sewing", lang);
  if (normalized.includes("döşeme")) return t("dept_upholstery", lang);
  if (normalized.includes("boya")) return t("dept_paint", lang);
  if (normalized.includes("satın") || normalized.includes("procurement"))
    return t("dept_purchasing", lang);
  if (normalized === "kumaş") return t("dept_fabric", lang);

  return deptName; // Eşleşme yoksa olduğu gibi dön
}

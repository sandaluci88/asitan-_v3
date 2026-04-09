# Sandaluci Ayça (Kaya SDR) - Akıllı Üretim Takip Asistanı

![Version](https://img.shields.io/badge/version-2.6-blue.svg)
![Status](https://img.shields.io/badge/status-production--ready-green.svg)
![AI](https://img.shields.io/badge/AI-Gemini_2.0_Pro-orange.svg)

Sandaluci Mobilya Fabrikası için geliştirilmiş, Telegram tabanlı, yapay zeka destekli Üretim Takip ve Yönetici Asistanıdır. Ayça, fabrikanın işleyişini dijitalleştirerek üretim hatalarını sıfıra indirmeyi ve verimliliği artırmayı hedefler.

---

## Mimari Yapı

```
src/
├── index.ts                          # Bot başlatma ve wiring (328 satır)
├── handlers/
│   ├── callback.handler.ts           # Tüm buton/callback işlemleri
│   ├── command.handler.ts            # Komut handler'ları (/start, /durum vb.)
│   └── message.handler.ts            # Mesaj, ses, belge işleme
├── services/
│   ├── distribution.service.ts       # Sipariş dağıtım ve PDF gönderimi
│   ├── gmail-polling.service.ts      # Gmail'den sipariş çekme döngüsü
│   ├── pdf.service.ts                # PDF oluşturma
│   └── webhook.service.ts            # Webhook işlemleri
├── repositories/
│   └── order.repository.ts           # Supabase + JSON fallback veri katmanı
├── models/
│   └── order.schema.ts               # Zod şemaları ve TypeScript tipleri
└── utils/
    ├── department.utils.ts           # Departman sabitleri ve yardımcı fonksiyonlar
    ├── draft-order.service.ts        # Persistent taslak sipariş yönetimi
    ├── excel-order-parser.ts         # Excel sipariş parser
    ├── gmail.service.ts              # IMAP Gmail servisi
    ├── i18n.ts                       # Türkçe/Rusça çeviri
    ├── llm.service.ts                # OpenRouter LLM servisi
    ├── memory.service.ts             # Sohbet hafızası (dosya tabanlı)
    ├── order.service.ts              # Sipariş iş mantığı
    ├── staff.service.ts              # Personel yönetimi
    ├── supabase.service.ts           # Supabase veritabanı servisi
    └── cron.service.ts               # Zamanlanmış görevler
```

---

## Öne Çıkan Özellikler

### Sipariş Akışı
1. **Gmail Entegrasyonu** — Her 60 saniyede okunmamış mailler kontrol edilir
2. **Excel/Text Parse** — LLM ile sipariş departmanlara otomatik ayrılır
3. **Manuel/Otomatik Dağıtım** — Dikişhane/Döşemehane manuel, diğerleri otomatik
4. **Split Mode** — Marina'nın miktar bazlı personel dağıtımı
5. **PDF İş Emirleri** — Her departmana Rusça PDF gönderimi

### Takip Sistemi
- **5-3 Gün Uyarı** — Teslimata yaklaştıkça periyodik hatırlatmalar
- **Kumaş Takibi** — 24 saatte bir kumaş durumu kontrolü
- **Üretim Takibi** — 20 gün sonra "Bitti mi?" sorgusu
- **Sabah/Akşam Brifingi** — Personel kontrol mesajları

### Dil ve Yerelleştirme
- %100 Rusça üretim dokümanları (personel için)
- Türkçe patron arayüzü (Barış Bey için)
- Çift dilli ürün adları `[TR] ... / [RU] ...`

---

## Teknoloji Yığını

| Katman | Teknoloji |
|--------|-----------|
| Runtime | Node.js, TypeScript |
| Telegram | Grammy Framework |
| Veritabanı | Supabase (PostgreSQL + pgvector) |
| AI Engine | OpenRouter (Gemini 2.0 Pro / Qwen 3.5) |
| Excel | ExcelJS + Özel XlsxUtils |
| PDF | PDFKit |
| Email | imapflow + nodemailer |
| Loglama | Pino |

---

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur
cp .env.example .env
# .env içine API key'leri ekle

# Geliştirme modunda çalıştır
npm run dev

# Production build
npm run build
npm start

# Tip kontrolü
npm run typecheck

# Test
npm test
```

---

## Ortam Değişkenleri

| Değişken | Açıklama |
|----------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram Bot API token |
| `TELEGRAM_CHAT_ID` | Varsayılan sohbet ID |
| `TELEGRAM_BOSS_ID` | Barış Bey'in Telegram ID |
| `TELEGRAM_MARINA_ID` | Marina'nın Telegram ID |
| `OPENROUTER_API_KEY` | OpenRouter API anahtarı |
| `OPENROUTER_MODEL` | Kullanılacak LLM modeli |
| `SUPABASE_URL` | Supabase proje URL |
| `SUPABASE_KEY` | Supabase API anahtarı |
| `GMAIL_USER` / `GMAIL_PASS` | Gmail IMAP bilgileri |
| `SYSTEM_PROMPT_PATH` | Ayça'nın sistem prompt dosyası |

---

## Komutlar

| Komut | Yetki | Açıklama |
|-------|-------|----------|
| `/start` | Herkes | Bot tanıtımı |
| `/durum` | Patron | Üretim durumu raporu |
| `/ajanda` | Patron | Takvim ajandası |
| `/personel` | Patron | Personel listesi |
| `/kayit` | Patron | Yeni personel kaydı |
| `/sil` | Patron | Personel silme |
| `/takip` | Patron | Üretim takip özeti |
| `/doctor` | Patron | Sistem sağlık kontrolü |
| `/temizlik` | Patron | Veritabanı temizleme |
| `/dev` | Patron | Geliştirici modu |

---

## Organizasyon Yapısı

| Rol | Yetkili | Tanım |
|-----|---------|-------|
| **SuperAdmin** | Barış Bey | Sistem sahibi, tam yetkili |
| **Koordinatör** | Marina | Üretim trafiğini yönetir |
| **Dijital Asistan** | Ayça | AI üretim asistanı |
| **Departmanlar** | Atölye Personeli | Karkas, Metal, Boya, Döşeme, Dikiş |

---

## Yapılacaklar (Yarın)

- [ ] `.env` dosyasını sunucuda güncelle — Tüm Telegram ID'leri `1030595483` olarak değiştir:
  - `TELEGRAM_CHAT_ID`
  - `TELEGRAM_ALLOWLIST_USER_ID`
  - `TELEGRAM_BOSS_ID`
  - `TELEGRAM_MARINA_ID`
- [ ] Sunucuda `git pull` ve restart yap
- [ ] Split (bölüştürme) dağıtımını test et — Marina "📊 Разделить" butonuna basıp `Almira: 40, Natalya: 20` formatında yazmalı
- [ ] `DEV_MODE=true` → production'da `false` yapılacak mı karar ver

---

_Bu proje Sandaluci Mobilya Fabrikası için özel olarak geliştirilmiştir._

# Sandaluci Asistan V3 — Akıllı Üretim Takip Asistanı

![Version](https://img.shields.io/badge/version-3.0-blue.svg)
![Status](https://img.shields.io/badge/status-production--ready-green.svg)
![AI](https://img.shields.io/badge/AI-Gemini_2.0_Pro-orange.svg)

Sandaluci Mobilya Fabrikası için geliştirilmiş, Telegram tabanlı, yapay zeka destekli üretim takip ve yönetici asistanı. V3, npm workspaces monorepo mimarisiyle yeniden yapılandırılmıştır.

---

## Mimari Yapı

```
Asistan_V3/
├── packages/
│   ├── core/          → @sandaluci/core — Paylaşılan kütüphane
│   │   ├── models/         Zod şemaları ve TypeScript tipleri
│   │   ├── repositories/   Supabase veri katmanı
│   │   ├── services/       Excel parser, LLM, sipariş, personel servisleri
│   │   └── utils/          Departman, i18n, xlsx yardımcıları
│   ├── bot/           → @sandaluci/bot — Telegram bot (Grammy)
│   │   ├── handlers/       Callback, command, message handler'ları
│   │   ├── services/       Dağıtım, Gmail polling, PDF, cron, voice
│   │   └── middleware/     Bot middleware katmanı
│   ├── wiki/          → @sandaluci/wiki — İkinci Beyin (LLM Wiki motoru)
│   ├── kaizen/        → @sandaluci/kaizen — Prompt self-improvement
│   └── dashboard/     → @sandaluci/dashboard — Next.js web panel
├── vault/             → Wiki dosya deposu
│   ├── raw/                Ham kaynak dosyaları
│   ├── wiki/               İşlenmiş wiki sayfaları
│   └── schema/             Wiki şema kuralları
├── tests/             → Test suite (Vitest)
├── supabase_schema_v3.sql  → Veritabanı şeması
└── Dockerfile              → Docker deployment
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

### AI Güvenlik (Hallucination Prevention)

- **Context Grounding** — Her mesajda aktif sipariş adedi LLM'e somut veri olarak sunulur
- **Order Guard** — Aktif sipariş yoksa hayali veri üretimi engellenir
- **Status Query** — Doğal dil soruları DB sorgusuyla yanıtlanır

### Wiki (İkinci Beyin)

- Etkileşimler otomatik wiki'ye kaydedilir
- `vault/wiki/index.md` üzerinden bilgi erişimi
- LLM destekli sorgulama ve güncelleme

### Kaizen (Self-Improvement)

- Her LLM çağrısı `KaizenTracker` ile izlenir
- Günlük orüntü tespiti ve prompt optimizasyonu
- Prompt versiyonları veritabanında izlenir

### Dil ve Yerelleştirme

- %100 Rusça üretim dokümanları (personel için)
- Türkçe patron arayüzü (Barış Bey için)
- Çift dilli ürün adları `[TR] ... / [RU] ...`

---

## Teknoloji Yığını

| Katman     | Teknoloji                              |
| ---------- | -------------------------------------- |
| Runtime    | Node.js 20 + TypeScript (ESM)          |
| Monorepo   | npm workspaces                         |
| Telegram   | Grammy Framework                       |
| Veritabanı | Supabase (PostgreSQL + pgvector)       |
| AI Engine  | OpenRouter (Gemini 2.0 Pro / Qwen 3.5) |
| Excel      | ExcelJS + Özel XlsxUtils               |
| PDF        | PDFKit                                 |
| Email      | imapflow + nodemailer                  |
| Dashboard  | Next.js 15 + React 19                  |
| Validation | Zod                                    |
| Test       | Vitest                                 |
| Loglama    | Pino                                   |

---

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur
cp .env.example .env

# Geliştirme modunda çalıştır
npm run dev:bot

# Dashboard geliştirme
npm run dev:dashboard

# Production build
npm run build

# Tip kontrolü
npm run typecheck

# Test
npm run test
```

---

## Ortam Değişkenleri

| Değişken                    | Açıklama                       |
| --------------------------- | ------------------------------ |
| `TELEGRAM_BOT_TOKEN`        | Telegram Bot API token         |
| `TELEGRAM_CHAT_ID`          | Varsayılan sohbet ID           |
| `TELEGRAM_BOSS_ID`          | Barış Bey'in Telegram ID       |
| `TELEGRAM_MARINA_ID`        | Marina'nın Telegram ID         |
| `OPENROUTER_API_KEY`        | OpenRouter API anahtarı        |
| `OPENROUTER_MODEL`          | Kullanılacak LLM modeli        |
| `SUPABASE_URL`              | Supabase proje URL             |
| `SUPABASE_KEY`              | Supabase API anahtarı          |
| `GMAIL_USER` / `GMAIL_PASS` | Gmail IMAP bilgileri           |
| `SYSTEM_PROMPT_PATH`        | Ayça'nın sistem prompt dosyası |

---

## Bot Komutları

| Komut       | Yetki  | Açıklama               |
| ----------- | ------ | ---------------------- |
| `/start`    | Herkes | Bot tanıtımı           |
| `/durum`    | Patron | Üretim durumu raporu   |
| `/ajanda`   | Patron | Takvim ajandası        |
| `/personel` | Patron | Personel listesi       |
| `/kayit`    | Patron | Yeni personel kaydı    |
| `/sil`      | Patron | Personel silme         |
| `/takip`    | Patron | Üretim takip özeti     |
| `/doctor`   | Patron | Sistem sağlık kontrolü |
| `/temizlik` | Patron | Veritabanı temizleme   |
| `/dev`      | Patron | Geliştirici modu       |

---

## Organizasyon Yapısı

| Rol                 | Yetkili          | Tanım                              |
| ------------------- | ---------------- | ---------------------------------- |
| **SuperAdmin**      | Barış Bey        | Sistem sahibi, tam yetkili         |
| **Koordinatör**     | Marina           | Üretim trafiğini yönetir           |
| **Dijital Asistan** | Ayça             | AI üretim asistanı                 |
| **Departmanlar**    | Atölye Personeli | Karkas, Metal, Boya, Döşeme, Dikiş |

---

## Test Suite

```
tests/
├── callback-handler.test.ts      Callback handler birim testleri
├── distribution.test.ts          Dağıtım servis testleri
├── distribution-rules.test.ts    Dağıtım kural testleri
├── excel-parser-strict.test.ts   Excel parser sıkı testler
├── excel-connections.test.ts     Excel bağlantı testleri
├── e2e-pipeline.test.ts          Uçtan uca pipeline testi
├── gmail-polling.test.ts         Gmail polling testleri
├── i18n-department.test.ts       Çeviri/departman testleri
├── order-integrity.test.ts       Sipariş bütünlük testleri
├── pdf-quality.test.ts           PDF kalite testleri
├── pdf-russian-only.test.ts      Rusça PDF testleri
├── tracking-rules.test.ts        Takip kural testleri
├── real-excel-pdf.test.ts        Gerçek Excel+PDF entegrasyon testi
├── fixtures/                     Test veri dosyaları
└── helpers/                      Mock ve yardımcı modüller
```

---

## Dağıtım (Deployment)

Docker ile dağıtım için `Dockerfile` mevcuttur. PDF üretimi için `canvas` kütüphanesi C++ ve Cairo bağımlılıkları gerektirir. `Dockerfile` içerisinde `pkg-config` ve `build-essential` paketleri bulunur.

```bash
# Docker build
docker build -t sandaluci-asistan .

# Docker run
docker run -d --env-file .env sandaluci-asistan
```

---

_Bu proje Sandaluci Mobilya Fabrikası için özel olarak geliştirilmiştir._

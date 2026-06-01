# Sandaluci Asistan V3 — Ayca

![Version](https://img.shields.io/badge/version-3.1-blue.svg)
![Status](https://img.shields.io/badge/status-production-green.svg)
![AI](https://img.shields.io/badge/AI-Gemini_2.5_Pro-orange.svg)
![Memory](https://img.shields.io/badge/memory-Supabase_persistent-9cf.svg)
![Cron](https://img.shields.io/badge/cron-order__aware-brightgreen.svg)

Sandaluci Mobilya Fabrikası için geliştirilmiş, Telegram tabanlı, yapay zeka destekli üretim takip ve yönetici asistanı. V3, npm workspaces monorepo mimarisiyle yeniden yapılandırılmıştır.

> 💡 **Hermes Agent'tan ilham alınmıştır** — Kapalı öğrenme döngüsü, sipariş bazlı cron, context compression ve persistent memory kavramları [Hermes Agent](https://github.com/NousResearch/hermes-agent) mimarisinden uyarlanmıştır.

---

## Mimari Yapı

```
Asistan_V3/
├── packages/
│   ├── core/          → @sandaluci/core — Paylaşılan kütüphane
│   │   ├── models/         Zod şemaları ve TypeScript tipleri
│   │   ├── repositories/   Supabase veri katmanı
│   │   ├── services/       LLM, sipariş, personel + Memory + Compression
│   │   └── utils/          Departman, i18n, xlsx yardımcıları
│   ├── bot/           → @sandaluci/bot — Telegram bot (Grammy)
│   │   ├── handlers/       Callback, command, message handler'ları
│   │   └── services/       Dağıtım, Gmail, PDF, cron, order-cron, voice
│   ├── wiki/          → @sandaluci/wiki — İkinci Beyin (LLM Wiki motoru)
│   └── kaizen/        → @sandaluci/kaizen — LLM-powered self-improvement
├── vault/             → Wiki dosya deposu
│   ├── raw/                Ham kaynak dosyaları
│   ├── wiki/               İşlenmiş wiki sayfaları + Ayça persona
│   └── schema/             Wiki şema kuralları
├── data/              → Çalışma zamanı verileri
├── tests/             → Test suite (Vitest)
├── supabase_schema_v3.sql                 → Ana veritabanı şeması
├── supabase_schema_conversation_memory.sql → Sohbet hafızası şeması
├── supabase_schema_order_cron_jobs.sql    → Sipariş cron şeması
└── Dockerfile                              → Docker deployment (multi-stage)
```

---

## Öne Çıkan Özellikler

### Sipariş Akışı

1. **Gmail Entegrasyonu** — Her 60 saniyede okunmamış mailler kontrol edilir
2. **Excel/Text Parse** — Deterministik parser ile sipariş departmanlara otomatik ayrılır
3. **Manuel/Otomatik Dağıtım** — Dikişhane/Döşemehane manuel, diğerleri otomatik
4. **Split Mode** — Marina'nın miktar bazlı personel dağıtımı
5. **PDF İş Emirleri** — Her departmana Rusça PDF gönderimi
6. **Sipariş Bazlı Cron** — Her sipariş için otomatik takip job'ları oluşur

### Sipariş Bazlı Cron (Order-Aware Cron)

Her sipariş geldiğinde **4 otomatik takip job'ı** oluşur:

| Job Tipi | Ne Zaman | Kime | Açıklama |
|----------|----------|------|----------|
| 📦 `delivery_warning` | Teslim-5 gün | Barış Bey | Tek seferlik teslimat uyarısı |
| 🧶 `fabric_check` | Her 24 saat | Marina | Kumaş/dış alım durumu sorusu |
| 🔍 `production_followup` | Dağıtım+5 gün | Personel | "Bitti mi?" sorusu (5 günde bir tekrar) |
| 📊 `status_check` | Günlük 08:30 | Barış Bey | Sipariş bazlı durum özeti |

**Denetim Mekanizması:**
- `/cron` komutu ile tüm job'ların durumunu görüntüle
- Heartbeat'te otomatik reconciliation — job'suz siparişler tespit edilip oluşturulur
- Sipariş tamamlandığında job'lar otomatik silinir

### Persistent Memory (Supabase)

- Tüm sohbet geçmişi `conversation_memory` tablosunda saklanır
- Docker redeploy sonrası bile veri kaybı yok
- **Context Compression**: 6000 token üstünde eski mesajlar LLM ile özetlenir
- Son 6 mesaj her zaman korunur, geri kalan özetlenir
- File-based fallback: Supabase erişilemezse yerel dosyalara kaydeder

### Kaizen (LLM Self-Improvement)

Kapalı öğrenme döngüsü — Hermes Agent skill self-improve pattern:

```
Her LLM çağrısı → KaizenTracker.log()
         ↓
Günlük analiz → KaizenAnalyzer.analyze()
         ↓
LLM Meta-Prompt → KaizenOptimizer.optimize()
         ↓
A/B Test → KaizenEvaluator.evaluate()
         ↓
En iyi prompt aktif edilir
```

- **Optimizer**: LLM meta-prompt ile gerçek prompt iyileştirme
- **Evaluator**: LLM judge ile A/B test karşılaştırma
- Prompt versiyonları `prompt_versions` tablosunda izlenir

### AI Güvenlik (Hallucination Prevention)

- **Order Guard** — Aktif sipariş yoksa tüm üretim cron job'ları durur
- **Context Grounding** — Her mesajda aktif sipariş adedi LLM'e somut veri olarak sunulur
- **Status Query** — Doğal dil soruları DB sorgusuyla yanıtlanır (SSOT kuralı)
- **Compression Safety** — Özetleme sırasında sipariş numaraları, müşteri adları, kararlar korunur

### Wiki (İkinci Beyin)

- Etkileşimler otomatik wiki'ye kaydedilir
- `vault/wiki/index.md` üzerinden bilgi erişimi
- Ayça persona: `vault/wiki/persona/ayca-core-memory.md`
- 7 departman wiki sayfası + prosedürler + personel profilleri

### Dil ve Yerelleştirme

- %100 Rusça üretim dokümanları (personel için)
- Türkçe patron arayüzü (Barış Bey için)
- Çift dilli ürün adları `[TR] ... / [RU] ...`
- 300+ terim Türkçe→Rusça çeviri sözlüğü

---

## Teknoloji Yığını

| Katman     | Teknoloji                              |
| ---------- | -------------------------------------- |
| Runtime    | Node.js 20 + TypeScript (ESM)          |
| Monorepo   | npm workspaces                         |
| Telegram   | Grammy Framework                       |
| Veritabanı | Supabase (PostgreSQL + pgvector)       |
| AI Engine  | OpenRouter (Gemini 2.5 Pro)            |
| Excel      | ExcelJS + Özel XlsxUtils               |
| PDF        | PDFKit                                 |
| Email      | imapflow + nodemailer                  |
| Validation | Zod                                    |
| Test       | Vitest                                 |
| Loglama    | Pino                                   |

---

## Veritabanı Şeması

### Tablolar

| Tablo | Açıklama |
|-------|----------|
| `staff` | Personel kayıtları |
| `orders` | Sipariş başlıkları |
| `order_items` | Sipariş kalemleri |
| `visual_memory` | Ürün görselleri (pgvector embeddings) |
| `wiki_pages` | Wiki bilgi tabanı (pgvector) |
| `wiki_changelog` | Wiki değişiklik günlüğü |
| `prompt_decisions` | Kaizen LLM karar kayıtları |
| `prompt_versions` | Prompt versiyon kontrolü |
| `conversation_memory` | Kalıcı sohbet hafızası + compression |
| `order_cron_jobs` | Sipariş bazlı cron job'ları |

### Kurulum

SQL dosyalarını Supabase Dashboard → SQL Editor'de sırasıyla çalıştır:

```bash
1. supabase_schema_v3.sql
2. supabase_schema_conversation_memory.sql
3. supabase_schema_order_cron_jobs.sql
```

---

## Kurulum

```bash
# Bağımlılıkları yükle
npm install

# .env dosyasını oluştur
cp .env.example .env

# Geliştirme modunda çalıştır
npm run dev:bot

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
| `DEV_MODE`                  | false=Supabase, true=local JSON|
| `GMAIL_ENABLED`             | Gmail polling aktif/pasif      |
| `GMAIL_USER` / `GMAIL_PASS` | Gmail IMAP bilgileri           |
| `SYSTEM_PROMPT_PATH`        | Ayça'nın sistem prompt dosyası |
| `KAIZEN_ENABLED`            | Kaizen self-improvement aktif  |
| `ENABLE_KENAN`              | AI life coach mesajları aktif  |

---

## Bot Komutları

| Komut            | Yetki  | Açıklama                          |
| ---------------- | ------ | --------------------------------- |
| `/start`         | Herkes | Bot tanıtımı                      |
| `/durum`         | Patron | Üretim durumu raporu              |
| `/ajanda`        | Patron | Takvim ajandası                   |
| `/personel`      | Patron | Personel listesi                  |
| `/kayit`         | Patron | Yeni personel kaydı               |
| `/sil`           | Patron | Personel silme                    |
| `/takip`         | Patron | Üretim takip özeti                |
| `/cron`          | Patron | Sipariş bazlı cron durum raporu   |
| `/doctor`        | Patron | Sistem sağlık kontrolü            |
| `/temizlik`      | Patron | Veritabanı temizleme              |
| `/dev`           | Patron | Geliştirici modu                  |
| `/kaizen`        | Patron | Kaizen durumu                     |
| `/test_briefing` | Patron | Test brifingi                     |

---

## Organizasyon Yapısı

| Rol                 | Yetkili          | Tanım                              |
| ------------------- | ---------------- | ---------------------------------- |
| **SuperAdmin**      | Barış Bey        | Sistem sahibi, tam yetkili         |
| **Koordinator**     | Marina           | Üretim trafiğini yönetir           |
| **Dijital Asistan** | Ayça             | AI üretim asistanı                 |
| **Departmanlar**    | Atölye Personeli | Karkas, Metal, Boya, Döşeme, Dikiş |

### Departmanlar

| Departman | Emoji | Dağıtım | Emoji |
|-----------|-------|---------|-------|
| Karkas Üretimi | 🔩 | Otomatik | ✅ |
| Metal Üretimi | ⚙️ | Otomatik | ✅ |
| Boyahane | 🎨 | Otomatik | ✅ |
| Kumaş | 🧶 | Otomatik | ✅ |
| Dikişhane | 🧵 | Manuel (Marina onayı) | 📋 |
| Döşemehane | 🪑 | Manuel (Marina onayı) | 📋 |
| Satınalma | 🛒 | Otomatik | ✅ |
| Mobilya Dekorasyon | 🏠 | Otomatik | ✅ |

---

## Deployment

### Coolify (Production)

| Özellik      | Değer                                         |
| ------------ | --------------------------------------------- |
| Platform     | Coolify (Self-hosted PaaS)                    |
| Domain       | asistanv3.turklawai.com                       |
| Repo         | github.com/sandaluci88/asitan-_v3             |
| Base Dir     | `/Asistan_V3`                                 |
| Container    | Tek instance, auto-deploy                     |
| Health       | `GET /health` → `{"status":"ok","version":"3.1.0"}` |

### Docker (Manuel)

```bash
# Docker build
docker build -t sandaluci-v3 .

# Docker run
docker run -d \
  --name sandaluci-v3 \
  --restart unless-stopped \
  -p 3002:3000 \
  --env-file .env \
  sandaluci-v3
```

---

## Changelog

### 2026-06-01 — V3.1: Hermes-Inspired Upgrades

- **Persistent Memory**: `conversation_memory` tablosu ile Supabase'de kalıcı sohbet hafızası
- **Context Compression**: 6000 token üstünde LLM ile otomatik mesaj özetleme
- **Sipariş Bazlı Cron (Order-Aware)**: Her sipariş için 4 otomatik takip job'ı
  - `delivery_warning`, `fabric_check`, `production_followup`, `status_check`
- **Cron Reconciliation**: Heartbeat'te eksik job'ları otomatik tespit ve oluşturma
- **`/cron` Komutu**: Tüm siparişlerin cron durumunu gösteren rapor
- **KaizenOptimizer**: LLM meta-prompt ile gerçek prompt iyileştirme
- **KaizenEvaluator**: LLM judge ile A/B test karşılaştırma
- **MemoryService Upgrade**: Supabase primary, file-based fallback
- **DistributionService Hook**: Dağıtım sonrası otomatik job oluşturma

### 2026-05-06 — Coolify Deploy + Order Guard + Crash Fix

- **Coolify Deploy**: asistanv3.turklawai.com üzerinden otomatik deploy
- **Order Guard**: Aktif sipariş yoksa tüm cron job'lar durur
- **Gmail IMAP Fix**: connectionTimeout/socketTimeout eklendi
- **Null Guard**: orderService undefined durumuna karşı koruma

### 2026-05-04 — Production Deploy & Bug Fixes

- **IMAP Crash Fix**: ImapFlow error event listener eklendi
- **Gmail Opt-in**: GMAIL_ENABLED=true kontrolü
- **Vault Git'e Eklendi**: 18 wiki dosyası image'a dahil
- **Dockerfile Vault Desteği**: COPY vault/ vault/ eklendi

---

_Bu proje Sandaluci Mobilya Fabrikası için özel olarak geliştirilmiştir._

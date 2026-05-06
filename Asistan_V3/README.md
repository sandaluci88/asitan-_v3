# Sandaluci Asistan V3 — Ayca

![Version](https://img.shields.io/badge/version-3.0-blue.svg)
![Status](https://img.shields.io/badge/status-production-green.svg)
![AI](https://img.shields.io/badge/AI-Gemini_2.5_Pro-orange.svg)

Sandaluci Mobilya Fabrikası icin gelistirilmis, Telegram tabanli, yapay zeka destekli uretim takip ve yonetici asistani. V3, npm workspaces monorepo mimarisiyle yeniden yapilandirilmistir.

---

## Mimari Yapi

```
Asistan_V3/
├── packages/
│   ├── core/          → @sandaluci/core — Paylasilan kutuphane
│   │   ├── models/         Zod semalari ve TypeScript tipleri
│   │   ├── repositories/   Supabase veri katmani
│   │   ├── services/       Excel parser, LLM, siparis, personel servisleri
│   │   └── utils/          Departman, i18n, xlsx yardimcilari
│   ├── bot/           → @sandaluci/bot — Telegram bot (Grammy)
│   │   ├── handlers/       Callback, command, message handler'lari
│   │   └── services/       Dagitim, Gmail polling, PDF, cron, voice
│   ├── wiki/          → @sandaluci/wiki — Ikinci Beyin (LLM Wiki motoru)
│   └── kaizen/        → @sandaluci/kaizen — Prompt self-improvement
├── vault/             → Wiki dosya deposu
│   ├── raw/                Ham kaynak dosyalari
│   ├── wiki/               Islenmis wiki sayfalari + Ayca persona
│   └── schema/             Wiki sema kurallari
├── data/              → Calisma zamani verileri (staff.json, orders.json)
├── tests/             → Test suite (Vitest)
├── supabase_schema_v3.sql  → Veritabani semasi
└── Dockerfile              → Docker deployment (multi-stage)
```

---

## One Cikan Ozellikler

### Siparis Akisi

1. **Gmail Entegrasyonu** — Her 60 saniyede okunmamis mailler kontrol edilir
2. **Excel/Text Parse** — LLM ile siparis departmanlara otomatik ayrilir
3. **Manuel/Otomatik Dagitim** — Dikishane/Dosemehane manuel, digerleri otomatik
4. **Split Mode** — Marina'nin miktar bazli personel dagitimi
5. **PDF Is Emirleri** — Her departmana Rusca PDF gonderimi

### Takip Sistemi

- **5-3 Gun Uyari** — Teslimata yakinlastikca periyodik hatirlatmalar
- **Kumas Takibi** — 24 saatte bir kumas durumu kontrolu
- **Uretim Takibi** — Dagitimdan 5 is gunu sonra "Bitti mi?" sorgusu
- **Sabah/Aksam Brifingi** — Haftaici 08:30 ve 18:00 brifingler
- **Heartbeat** — 06:00-20:00 arasi her saat basi sistem kontrolu

### AI Guvenlik (Hallucination Prevention)

- **Context Grounding** — Her mesajda aktif siparis adedi LLM'e somut veri olarak sunulur
- **Order Guard** — Aktif siparis yoksa hayali veri uretimi engellenir
- **Status Query** — Dogal dil sorulari DB sorgusuyla yanitlanir

### Wiki (Ikinci Beyin)

- Etkilesimler otomatik wiki'ye kaydedilir
- `vault/wiki/index.md` uzerinden bilgi erisimi
- Ayca persona: `vault/wiki/persona/ayca-core-memory.md`

### Kaizen (Self-Improvement)

- Her LLM cagrisi `KaizenTracker` ile izlenir
- Gunluk oruntu tespiti ve prompt optimizasyonu
- Prompt versiyonlari veritabaninda izlenir

### Dil ve Yerellestirme

- %100 Rusca uretim dokumanlari (personel icin)
- Turkce patron arayuzu (Baris Bey icin)
- Cift dilli urun adlari `[TR] ... / [RU] ...`

---

## Teknoloji Yigini

| Katman     | Teknoloji                              |
| ---------- | -------------------------------------- |
| Runtime    | Node.js 20 + TypeScript (ESM)          |
| Monorepo   | npm workspaces                         |
| Telegram   | Grammy Framework                       |
| Veritabani | Supabase (PostgreSQL)                  |
| AI Engine  | OpenRouter (Gemini 2.5 Pro)            |
| Excel      | ExcelJS + Ozel XlsxUtils               |
| PDF        | PDFKit                                 |
| Email      | imapflow + nodemailer                  |
| Validation | Zod                                    |
| Test       | Vitest                                 |
| Loglama    | Pino                                   |

---

## Kurulum

```bash
# Bagimliliklari yukle
npm install

# .env dosyasini olustur
cp .env.example .env

# Gelistirme modunda calistir
npm run dev:bot

# Production build
npm run build

# Tip kontrolu
npm run typecheck

# Test
npm run test
```

---

## Ortam Degiskenleri

| Degisken                    | Aciklama                       |
| --------------------------- | ------------------------------ |
| `TELEGRAM_BOT_TOKEN`        | Telegram Bot API token         |
| `TELEGRAM_CHAT_ID`          | Varsayilan sohbet ID           |
| `TELEGRAM_BOSS_ID`          | Baris Bey'in Telegram ID       |
| `TELEGRAM_MARINA_ID`        | Marina'nin Telegram ID         |
| `OPENROUTER_API_KEY`        | OpenRouter API anahtari        |
| `OPENROUTER_MODEL`          | Kullanilacak LLM modeli        |
| `SUPABASE_URL`              | Supabase proje URL             |
| `SUPABASE_KEY`              | Supabase API anahtari          |
| `GMAIL_ENABLED`             | Gmail polling aktif/pasif      |
| `GMAIL_USER` / `GMAIL_PASS` | Gmail IMAP bilgileri           |
| `SYSTEM_PROMPT_PATH`        | Ayca'nin sistem prompt dosyasi |

---

## Bot Komutlari

| Komut       | Yetki  | Aciklama               |
| ----------- | ------ | ---------------------- |
| `/start`    | Herkes | Bot tanitimi           |
| `/durum`    | Patron | Uretim durumu raporu   |
| `/ajanda`   | Patron | Takvim ajandasi        |
| `/personel` | Patron | Personel listesi       |
| `/kayit`    | Patron | Yeni personel kaydi    |
| `/sil`      | Patron | Personel silme         |
| `/takip`    | Patron | Uretim takip ozeti     |
| `/doctor`   | Patron | Sistem saglik kontrolu |
| `/temizlik` | Patron | Veritabani temizleme   |
| `/dev`      | Patron | Gelistirici modu       |
| `/kaizen`   | Patron | Kaizen durumu          |
| `/test_briefing` | Patron | Test brifingi     |

---

## Organizasyon Yapisi

| Rol                 | Yetkili          | Tanim                              |
| ------------------- | ---------------- | ---------------------------------- |
| **SuperAdmin**      | Baris Bey        | Sistem sahibi, tam yetkili         |
| **Koordinator**     | Marina           | Uretim trafagini yonetir           |
| **Dijital Asistan** | Ayca             | AI uretim asistani                 |
| **Departmanlar**    | Atope Personeli  | Karkas, Metal, Boya, Doseme, Dikis |

---

## Deployment

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

### VPS (Production)

| Ozellik | Deger |
|---------|-------|
| Sunucu  | 5.182.33.26 (sanasistanv2.turklawai.com) |
| Port    | 3002 → 3000 |
| Container | `sandaluci-v3` (tek instance) |
| Health  | `GET /health` → `{"status":"ok","version":"3.0.0"}` |

---

## Changelog

### 2026-05-06 — Gmail + Crash Fix + Full Deploy

- **Gmail Aktif**: Yeni App Password ile IMAP baglantisi kuruldu. `GMAIL_ENABLED=true`
- **orderService Crash Fix**: `CronService.getInstance()` cagrisina `staffService` ve `orderService` parametreleri eklendi
- **Null Guard**: Tum `orderService` cagrilari icin undefined kontrolu eklendi (CronService, ProactiveService)
- **IMAP Timeout**: `connectionTimeout: 15000` ve `socketTimeout: 30000` eklendi
- **Container Cleanup**: Eski V2 container'lari ve duplicate instance'lar silindi
- **V3 Docker Image**: Multi-stage build ile vault dosyalari dahil edildi
- **Wiki/Ayca Persona**: Container icinde `ayca-core-memory.md` mevcut ve yuklu

### 2026-05-04 — Production Deploy & Bug Fixes

- **IMAP Crash Fix**: ImapFlow client'a `error` event listener eklendi
- **Gmail Opt-in**: `GMAIL_ENABLED=true` olmadan Gmail polling baslamiyor
- **Vault Git'e Eklendi**: 18 wiki dosyasi Git'e eklendi
- **Dockerfile Vault Destegi**: `COPY vault/ vault/` ile image icine wiki dosyalari dahil edildi
- **SUPABASE_KEY Fix**: Coolify env'deki bosluk hatasi giderildi

---

_Bu proje Sandaluci Mobilya Fabrikasi icin ozel olarak gelistirilmistir._

---
slug: procedures/pipeline-telegram-test-2026-04-23
title: "Pipeline Telegram Test Raporu — 2026-04-23"
type: procedure
tags: [test, telegram, e2e, mock, pdf, gmail, dagitim]
created: 2026-04-23
updated: 2026-04-23
---

# Pipeline Telegram Test Raporu — 23 Nisan 2026

## Ozet
Tam pipeline entegrasyon testleri yazildi ve canli test yapildi. Gmail polling -> Excel parse -> PDF -> Telegram dagitim akisi test edildi. 3 yeni bug tespit edildi ve duzeltildi.

## Mock Altyapisi

`tests/helpers/` dizininde 6 yardimci dosya olusturuldu:

| Dosya | Amac |
|-------|------|
| mock-bot.ts | Grammy Bot mock: sendMessage, sendDocument, sendPhoto, callbackQuery — tum cagrilari apiCalls dizisinde toplar |
| mock-gmail.ts | GmailService mock: sahte GmailMessage isler |
| mock-order-service.ts | OrderService mock: parseAndCreateOrder sahte order dondurur |
| mock-staff-service.ts | StaffService mock: departman/ID/isim bazli personel sorgulama |
| mock-context.ts | Grammy Context mock: answerCallbackQuery, editMessageText, reply |
| test-data.ts | Ortak test verileri: personel listesi, order fabrikalari, sabit ID'ler |

## Yeni Test Dosyalari (~38 test)

| Dosya | Test Sayisi | Kapsam |
|-------|-------------|--------|
| distribution.test.ts | 12 | PDF -> Telegram sendDocument akisi |
| gmail-polling.test.ts | 10 | Mail -> Excel -> dagitim orkestrasyonu |
| callback-handler.test.ts | 10 | Personel secim callbackleri |
| e2e-pipeline.test.ts | 6 | Gercek Excel ile tam pipeline |

### Distribution Testleri
- Karkas personeli varsa -> sendDocument o kisiye gider
- Personel yoksa -> Marina fallback
- Satialma -> her zaman Marina
- assignedWorker ile -> o calisanin telegramId sine
- Ayni departman birden fazla kalem -> tek PDF
- Mukerrer mesaj penceresi (5s) -> ikinci gonderim engellenir
- PDF buffer %PDF- ile basliyor
- Caption Rusca
- Basarisiz gonderim -> service crash etmez
- Tum departmanlar basarisiz -> patrona kritik uyari

### Gmail Polling Testleri
- xlsx ekli mail -> parseAndCreateOrder cagrilir
- Ayni UID tekrar islenmez (dedup)
- Ek dosya yok -> text analysis path
- Telegram email ozet bildirimi gider
- Birden fazla xlsx eki -> her biri bagimsiz islenir
- Otomatik departmanlar -> dogrudan dagitim
- Manuel departman varsa -> Marina inline keyboard

### Callback Handler Testleri
- select_dept_staff -> personel listesi keyboard
- aw (assign worker) -> worker atanir + PDF gonderilir
- finalize_dist -> tum departmanlara dagitim
- reject_order -> draft silinir
- auto_distribute -> manuel dept yoksa tumune dagitir
- split_mode -> bolusturme giris modu

## Duzeltilen Buglar

### BUG-9: PDF Caption Dili
- **Dosya:** packages/bot/src/services/distribution.service.ts
- **Sorun:** PDF is emri caption Turkce gonderiliyordu
- **Sebep:** staffService.getStaffByTelegramId() ile personel dili aliniyordu, test ID'leri boss ID ile ayni oldugundan "tr" donuyordu
- **Cozum:** `const lang = "ru"` — PDF is emirleri her zaman Rusca
- **Satir:** distribution.service.ts:161

### BUG-10: Secim Ekranlari Kalici
- **Dosya:** packages/bot/src/handlers/callback.handler.ts
- **Sorun:** Personel secimi yapildiktan sonra inline keyboard kalici kaliyordu, tekrar basilabiliyordu
- **Cozum:** Tum manuel departmanlar atandiginda otomatik finalize edilir, reply_markup kaldirilir
- **Satir:** callback.handler.ts registerWorkerAssignment()

### BUG-11: Duplicate Order Blokaji
- **Dosya:** packages/core/src/services/order.service.ts
- **Sorun:** Ayni siparis numarasiyla gelen mail ikinci kez islenmiyordu
- **Cozum:** Otomatik yeni siparis numarasi atamasi (timestamp soneki ile)

## Canli Test Sonuclari

### Test Ortami
- Tum personel telegramId: 6030287709 (test amacli)
- Gmail: sandaluci88@gmail.com
- Siparis: SD-000011 (MARZHAN)
- Excel: SIPARIS FORMU-MARZHAN 03032026 (4).xlsx

### Pipeline Akisi
1. Gmail polling -> mail alindi
2. Excel eki ayristirildi -> 11 kalem, 6 departman
3. PDF is emirleri uretildi (Karkas, Boyahane, Metal, Kumas, Satialma, Dikishane)
4. Telegram gonderimi basarili

### Tespit Edilen Sorunlar
- PDF caption Turkce idi -> BUG-9 ile duzeltildi
- Secim ekranlari kapanmiyordu -> BUG-10 ile duzeltildi
- Duplicate siparis blokaji -> BUG-11 ile duzeltildi

## Toplam Test Durumu

| Kategori | Sayi |
|----------|------|
| Onceki testler | 222 |
| Yaki pipeline testleri | 38 |
| Toplam | 260 |

## Bekleyen Isler
- Bot restart ile son düzeltmelerin canli dogrulamasi
- PDF ic metin tamamen Rusca mi (bot restart sonrasi kontrol)
- visual_memory tablosu embedding kolonu eksik
- Git commit

## Baglantilar
- [[procedures/testing-report-2026-04-23]] — Onceki kati test raporu
- [[procedures/order-distribution]] — Dagitim proseduru

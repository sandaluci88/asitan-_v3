---
slug: procedures/live-telegram-test-2026-04-23
title: "Canli Telegram Pipeline Test — 2026-04-23"
type: procedure
tags: [test, telegram, canli, pdf, font, i18n, bug]
created: 2026-04-23
updated: 2026-04-23
---

# Canli Telegram Pipeline Test — 23 Nisan 2026

## Ozet
Bot canli ortamda test edildi. Gmail polling, Excel parse, PDF uretimi ve Telegram dagitimi tam pipeline olarak calistirildi. 6 yeni bug tespit edildi, 4'u duzeltildi, 2'si bekliyor.

## Yapilan Duzeltmeler

### BUG-12: Mukerrer Siparis Tamamen Atlanmali
- **Dosya:** packages/core/src/services/order.service.ts
- **Sorun:** Ayni siparis no ile gelen ikinci mail yeni numara aliyordu — sonsuz kopya olusuyordu
- **Cozum:** Ayni SD-XXXXX veya SD-XXXXX-* ile eslesen siparisler tamamen atlaniyor (`isDuplicate: true` donuluyor)
- **Satir:** order.service.ts satir 139-147, 503-511

### BUG-13: PDF Font Eksik (dist/)
- **Dosya:** packages/bot/package.json
- **Sorun:** `tsc` font dosyalarini `dist/`'e kopyalamiyordu. Bot `dist/`'ten calisirken Roboto font bulunamiyordu, Helvetica fallback kullaniliyordu — Kiril karakterler kutu olarak gorunuyordu
- **Cozum:** build script'e font kopyalama eklendi: `tsc && node -e "...copy fonts..."`
- **Sonuc:** PDF'lerde Kiril karakterler artik Roboto font ile dogru render ediliyor

### BUG-14: Dil Paketi — Hardcoded Rusca Metinler
- **Dosya:** packages/core/src/utils/i18n.ts, callback.handler.ts, pdf.service.ts, distribution.service.ts
- **Sorun:** 20+ hardcoded Rusca metin i18n sistemine bagli degildi. Departman adlari ham formda gosteriliyordu ("Dikishane" yerine "Швейный цех")
- **Cozum:** 15+ yeni i18n anahtari eklendi (cb_select_worker, cb_no_staff, pdf_photo_col, pdf_fabric_title, vb.). Tum hardcoded metinler `t()` ve `translateDepartment()` ile degistirildi
- **Etkilenen dosyalar:** i18n.ts, callback.handler.ts, pdf.service.ts, distribution.service.ts

### BUG-15: Callback Handler — Ham Departman Isimleri
- **Dosya:** packages/bot/src/handlers/callback.handler.ts
- **Sorun:** Telegram mesajlarinda departman adlari Turkce ham formda gosteriliyordu ("Dikishane", "Dosemehane")
- **Cozum:** `translateDepartment(deptName, "ru")` ile Rusca departman isimleri gosteriliyor

## Bekleyen Buglar (Cozulmedi)

### BUG-16: Excel Detaylari Turkce Geliyor
- **Sorun:** Excel'den gelen detay metinleri ("Kouy Ceviz", "Domiart River") Turkce olarak PDF'e aktariliyor
- **Beklenen:** Detay metinleri Rusca olmali veya ceviri yapilmali
- **Yaklasim:** Excel parse sirasinda LLM ile Turkce→Rusca ceviri yapilabilir, veya `details` alanina Rusca alternatif eklenmeli

### BUG-17: PDF'te Resimler Gorunmuyor
- **Sorun:** Canli testte olusturulan PDF'lerde urun resimleri yok
- **Muhtemel Neden:** `imageBuffer` veya `imageUrl` yolu bos/yanlis geliyor olabilir
- **Arastirilacak:** Excel parse sirasinda resimlerin nasil extract edildigi ve PDF'e nasil aktarildigi

### Secim Ekranlari Sorunu
- Dikishane/Dosemehane secim butonlari calisiyor ama secim sonrasi eski butonlar gorunmeye devam edebiliyor
- Otomatik finalize kodu mevcut ama bazen editMessageText ayni icerik hatasi veriyor

## Canli Test Sonuclari

### Basarili Olanlar
- Gmail polling: 60sn'de bir kontrol, IMAP baglantisi stabil
- Excel parse: 11 kalem, 6 departman dogru ayristirildi
- Mukerrer onleme: Ayni mail 4 kez gelirse bile sadece 1 siparis olusturuldu
- Otomatik dagitim: Karkas, Boyahane, Kumas, Satialma → PDF gonderildi
- Manuel dagitim: Dikishane → Natalya, Dosemehane → Viktor atandi
- Supabase kayit: Siparis ve itemler dogru kaydedildi

### Test Akisi
1. Mail geldi → Gmail IMAP ile alindi
2. Excel ayristirildi → 11 kalem, SD-000011
3. Otomatik departmanlara PDF gonderildi (Karkas, Boyahane, Kumas, Satialma)
4. Manuel departmanlar icin inline keyboard gosterildi (Dikishane, Dosemehane)
5. Personel secildi → PDF gonderildi
6. Tekrar eden mailler atlandi

## Toplam Test Durumu

| Kategori | Sayi |
|----------|------|
| Unit/Integration testler | 312/312 PASSED |
| Bug duzeltme (bugun) | 4 duzeltildi, 2 bekliyor |
| Toplam bug (oturum) | 17 tespit, 15 duzeltildi |

## Baglantilar
- [[procedures/testing-report-2026-04-23]] — Onceki kati test raporu
- [[procedures/pipeline-telegram-test-2026-04-23]] — Pipeline mock test raporu
- [[procedures/order-distribution]] — Dagitim proseduru

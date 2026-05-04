---
slug: procedures/testing-report-2026-04-23
title: "V3 Katı Test Raporu — 2026-04-23"
type: procedure
tags: [test, kalite, bug-fix, pdf, excel-parser, dagitim]
created: 2026-04-23
updated: 2026-04-23
---

# V3 Kati Test Raporu — 23 Nisan 2026

## Ozet
Ayca V3'e kati testler uygulandı. 5 bug tespit edildi ve duzeltildi. 169 testin hepsi gecti.

## Duzeltilen Buglar

### BUG-1: Turkce Karakter — Karkas Tespiti
- **Dosya:** `packages/core/src/services/excel-order-parser.ts`
- **Sorun:** "Uretim Yapilacak" (Turkce u, i) → karkasFlag tetiklenmiyordu
- **Etki:** "Uretim Yapilacak" notlu urunler Karkas'a atanmiyordu
- **Cozum:** `normalizeTr()` fonksiyonu eklendi (u→u, o→o, s→s, c→c, g→g, i→i)
- **Test:** excel-parser-strict.test.ts

### BUG-2: Turkce Karakter — Manuel Departman Tespiti
- **Dosya:** `packages/core/src/utils/department.utils.ts`
- **Sorun:** "Dikishane" (Turkce'siz) → isManualDept() false donuyordu
- **Etki:** Dikishane/Dosemehane kalemleri otomatik dagitiliyordu, personel secimi sorulmuyordu
- **Cozum:** normalizeTr() + "Dikishane", "Dosemehane" varyantlari eklendi
- **Test:** distribution-rules.test.ts

### BUG-3: Dis Alim Routing
- **Dosya:** `packages/bot/src/services/distribution.service.ts`
- **Sorun:** Satialma kalemleri bossId'ye fallback ediyordu
- **Etki:** Dis alim is emirleri Marina'ya degil patrona gidiyordu
- **Cozum:** Satialma/Satinalma → her zaman marinaId'ye gonderilir
- **Test:** distribution-rules.test.ts

### BUG-4: Split Bolusturme Atama Hatasi
- **Dosya:** `packages/bot/src/handlers/callback.handler.ts`
- **Sorun:** Bolusturme sonrasi tum kalemler ilk kisiye assignedWorker yapiliyordu
- **Etki:** "Almira: 30, Natalya: 20" → hepsi Almira'ya atanirdi
- **Cozum:** Her kisiye sadece kendi adedi kadar kalem atanir + eksik dagitim uyari eklendi
- **Test:** order-integrity.test.ts

### BUG-5: Marina PDF Resim Boyutu
- **Dosya:** `packages/bot/src/services/pdf.service.ts`
- **Sorun:** Marina ozet PDF'de resimler 55x60 px → cok kucuk
- **Cozum:** 85x85 px'e buyutuldu, satir yuksekligi 70→90

## Test Sonuclari

### Genel: 169/169 PASSED, 0 FAILED

| Test Dosyasi | Test | Kapsam |
|---|---|---|
| excel-parser-strict.test.ts | 39 | Excel parse, garbage rejection, dept rules |
| order-integrity.test.ts | 30 | Sahte siparis reddi, plastik tespiti, dublike |
| pdf-quality.test.ts | 24 | PDF yapisi, resim boyutlari, font, arsiv |
| distribution-rules.test.ts | 22 | Direk/secimli/dis alim dagitim kurallari |
| real-excel-pdf.test.ts | 16 | Gercek MARZHAN Excel → resimli PDF uretimi |
| schemas.test.ts | 31 | Zod schema validation |
| i18n-department.test.ts | 7 | Ceviri dogrulugu |

### Gercek Excel Testi (MARZHAN Siparisi)
- **Kaynak:** SIPARIS FORMU-MARZHAN 03032026 (4).xlsx
- **Musteri:** Marzhan, sehir Zhetisay
- **Siparis No:** SD-000011
- **Resimler:** 3 adet (35KB, 35KB, 61KB PNG)
- **Kalemler:** 11 adet, 6 departmana dagitildi
- **PDF Ciktilari:**
  - `is_emri_Karkas_Uretimi.pdf` (100 KB, resimli)
  - `marina_summary.pdf` (512 KB, 3 resimli)

## Onemli Dogrulamalar

### Siparis Uydurma Yok
- Bos Excel → null doner (siparis olusturmaz)
- Garbage dosya → null doner
- Sadece urunAdi dolu satirlar islenir
- Her kalem bir Excel satirina karsilik gelir (rowIndex >= 9)

### Departman Kurallari Dogru
- AHSAP + karkas/uretim → Karkas Uretimi
- PLASTIK/PP/PVC → Satialma (her zaman Marina'ya)
- boya dolu → Boyahane
- kumas dolu → Kumas
- dikis dolu → Dikishane
- doseme dolu → Dosemehane
- Hicbiri → default departman

### PDF Kalitesi
- Is Emri PDF: resim 120x120 px (yeterli)
- Marina Ozet PDF: resim 85x85 px (duzeltildi)
- Font: Roboto Regular + Bold mevcut
- PDF→PNG conversion: 3x scale (yuksek kalite)

## Baglantilar
- [[procedures/order-distribution]] — Guncellenmis dagitim proseduru
- [[people/marina]] — Dis alim ve koordinator

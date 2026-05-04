# Wiki Log

## [2026-04-22] ingest | Vault Iskeleti Olusturuldu
- Dizin yapisi: raw/, wiki/, schema/
- Index ve log dosyalari olusturuldu
- Organizasyon yapisi seed olarak eklendi

## [2026-04-22] ingest | Departman Sayfalari Olusturuldu
- 6 departman sayfasi: karkas, metal, boyahane, dikishane, dosemehane, mobilya-dekorasyon
- Kaynak: docs/yonetim_calismasi.md

## [2026-04-22] ingest | Kisi ve Prosedur Sayfalari
- Kisi: marina
- Prosedurler: order-distribution, fabric-tracking
- Kaynak: docs/yonetim_calismasi.md, memory/core_memory.md

## [2026-04-23] test | V3 Kati Test Raporu — 169/169 PASSED
- 5 bug duzeltildi: Turkce karakter, dis alim routing, split bolusturme, PDF resim boyutu
- 7 test dosyasi, gercek MARZHAN Excel ile test edildi

## [2026-04-23] update | Dagitim Proseduru Guncellendi
- Baris Bey kurallari: Karkas/Boya/Metal → direk, Dikis/Doseme → secimli, Dis alim → Marina

## [2026-04-23] update | Takip Proseduru Guncellendi + Test Edildi
- Kumas 24s, Personel 5 gun, Olumsuzluk → Marina'ya rapor
- tracking-rules.test.ts eklendi (11 test)

## [2026-04-23] fix | PDF Is Emri Tamamen Rusca Yapildi
- BUG-6~8: i18n anahtarlari, departman eslesme, tarih formati
- 222 test, 9 dosya, 8 bug duzeltme

## [2026-04-23] test | Pipeline Telegram Test — 38 yeni test, 3 bug fix
- Mock altyapisi: tests/helpers/ (6 dosya)
- BUG-9~11: caption Rusca, secim ekranlari, duplicate order

## [2026-04-23] test | Canli Telegram Pipeline Test — 6 bug, 4 duzeltildi
- BUG-12: Mukerrer siparis tamamen atlaniyor
- BUG-13: PDF font eksik → build script'e font kopyalama eklendi
- BUG-14: 20+ hardcoded Rusca metin i18n'e tasindi
- BUG-15: Departman adlari Rusca cevriliyor
- 312/312 test PASSED
- Etkilenen sayfalar: [[procedures/live-telegram-test-2026-04-23]]

## [2026-04-23] fix | BUG-16 + BUG-17 Duzeltildi
- **BUG-16 (Turkce detaylar → Rusca)**: 100+ ceviri girdisi eklendi (renkler, agac turleri, kumaslar, yuzey islemleri). `translateMaterial()` fonksiyonu ile tam + kismi eslesme. Tum degerler (boya, kumas, dikis, doseme) artik Rusca etiketli stringlere CevrilmEdEN once translate ediliyor. `fabricDetails.name` ve `paintDetails.name` da cevriliyor.
- **BUG-17 (PDF resimler gorunmuyor)**: `parseOrderExcel()` fonksiyonunda temp dosya silme `finally` bloğunda erken yapiliyordu — ExcelJS lazy-load icin dosya gerekli. Temp cleanup fonksiyon sonuna tasindi, image extraction temp dosya mevcutken yapiliyor.
- Dosya: `packages/core/src/services/excel-order-parser.ts`
- Test guncellemesi: "Ceviz" → "Орех", "Velur" → "Велюр"
- 312/312 test PASSED
- Supabase tamamen temizlendi (orders: 0, order_items: 0)
- Etkilenen sayfalar: log.md, index.md, [[procedures/todo-2026-04-24]]
## [2026-04-25] fix | BUG-18~23 Duzeltildi — Canli Test 2. Tur
- **BUG-18**: PDF dosya adi Cyrillic → `_` problemi → siparis no ile degistirildi (`SD-000011_Karkas_Uretimi_Is_Emri.pdf`)
- **BUG-19**: PDF details Turkce kaliyordu → 25+ yeni sozluk girdisi (uretim terimleri: sandalye, ayak, fanera, siparis vb.)
- **BUG-20**: Finalize tekrar TUM departmanlara PDF gonderiyordu → kaldirildi, her dept sadece 1 kez PDF aliyor
- **BUG-21**: "plasTik" Ingilizce → "пластик" eklendi
- **BUG-22**: "dis alim" Turkce bildirim → sadece Rusca
- **BUG-23**: Secim butonlari secimden sonra kaybolmuyordu → atanmis dept butonu kaldirildi, sadece atanmamislar + finish butonu
- **PDF cift ceviri**: `makeItem()` details'i 2 kez ceviriyordu → 1 kez yapildi
- **Build fix**: excel-order-parser.ts duplicate property hatalari duzeltildi
- **Build fix**: callback.handler.ts type hatasi duzeltildi
- 312/312 test PASSED
- Etkilenen dosyalar: distribution.service.ts, callback.handler.ts, excel-order-parser.ts, distribution.test.ts

## [2026-04-25] fix | BUG-24~27 Duzeltildi — Canli Test 3. Tur
- **BUG-24 (Mukerrer secim)**: Atanmis departmana tekrar tiklanabiliyordu → guard eklendi (`alreadyAssigned` kontrolu)
- **BUG-25 (Kismi kelime bozuklugu)**: `фанераDAN`, `ножкиI` gibi bozuk kelimeler → word boundary (`\b`) eklendi
- **BUG-26 (Eksik ceviri)**: 15+ yeni sozluk girdisi (icin→для, ve→и, yok→нет, dikis→шитьё, oturak→сиденье, gri→серый, faneradan→из фанеры, ayaklari→ножки, ekstra→дополнительно)
- **BUG-27 (Satialma + Dikishane ceviri)**: `extra` ve `ip` alanlari Turkce kaliyordu → `translateMaterial()` uygulandi
- Dosyalar: excel-order-parser.ts, callback.handler.ts
- 312/312 test PASSED
- Etkilenen sayfalar: [[procedures/todo-2026-04-25]]
## [2026-04-28] lint | Lint report: 3 issues found

## [2026-04-28] lint | Lint report: 3 issues found

## [2026-04-28] lint | Lint report: 3 issues found

## [2026-04-28] lint | Lint report: 3 issues found


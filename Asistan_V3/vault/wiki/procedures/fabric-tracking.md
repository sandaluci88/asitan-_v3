---
slug: procedures/fabric-tracking
title: Kumas ve Dis Alim Takip Proseduru
type: procedure
tags: [kumas, satin-alma, takip, prosedur, uretim-takip]
created: 2026-04-22
updated: 2026-04-23
sources: [memory/core_memory.md]
---

# Kumas ve Dis Alim Takip Proseduru

## Ozet
Gelmeyen kumaslar, dis alim kalemleri ve uretim durumunun periyodik takip proseduru.

## Takip Kurallari (Baris Bey — 2026-04-23)

### 1. Kumas Takibi
- **Periyot**: 24 saatte bir sor → gelince biter
- **Alici**: Marina
- **Zamanlama**: Her gun saat 09:00 (Asia/Almaty), Pazar haric
- **Kapsam**: fabricDetails.arrived === false olan tum kalemler

### 2. Personel Uretim Takibi
- **Periyot**: 5 gunde 1 durum sorgusu
- **Alici**: Marina'ya takip raporu
- **Zamanlama**: Her gun saat 10:30 (Asia/Almaty), Pazar haric
- **Kapsam**: Dagitildiktan 5 is gunu gecen tum uretim kalemleri

### 3. Olumsuzluk Raporlama
- **Kural**: Personel olumsuz geri bildirim verirse (ornegin "metal hammadde yok, is baslamadi")
- **Alici**: Marina'ya raporlanir
- **Format**: Departman + sorun + kalem detayi
- **Ornek**: "Metal Uretimi — hammadde yok, is baslamadi. Kalem: Koltuk (x5)"

## Hatirlatma Akisi (Kumas)
1. **Periyot**: Her kalem bazinda 24 saatte bir (Pazar haric, mesai saatleri)
2. **Alici**: Sadece Marina (Genel Koordinator)
3. **Zamanlama**: Her gun saat 09:00 (Asia/Almaty), Pazartesi-Cumartesi
4. **Format**: Tek mesajda tum bekleyen kalemler listelenir, her kalem icin 3 buton

## Butonlar (Kumas)
| Buton | Sonuc |
|-------|-------|
| Geldi | fabricDetails.arrived = true, status → uretimde |
| Gelmedi | lastReminderAt guncellenir, 24 saat sonra tekrar |
| Siparis Verildi | Kaydedilir, 24 saat sonra tekrar |

## Genel Kurallar
- Baris Bey'e bu hatirlatmalar gitmez
- Aktif siparis yoksa hatirlatma gonderilmez (Order Guard)
- Kumas geldiginde takip otomatik durur (arrived = true)

## Baglantilar
- [[people/marina]] — Hatirlatma alicisi
- [[departments/dikishane]] — Kumas kullanimi
- [[procedures/order-distribution]] — Ana dagitim sureci
- [[procedures/testing-report-2026-04-23]] — Test raporu

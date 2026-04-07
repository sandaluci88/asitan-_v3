# 🛋️ Sandaluci Ayça (Kaya SDR) - Akıllı Üretim Takip Asistanı

Sandaluci Mobilya Fabrikası için geliştirilmiş, Telegram tabanlı, yapay zeka destekli Üretim Takip ve Yönetici Asistanıdır.

## 🚀 Temel Özellikler
- **Akıllı Hafıza (Core Memory):** Soul ve operasyonel kuralların birleştirildiği tek parça hafıza yapısı.
- **Güçlü Zeka:** Google Gemini 2.0 Pro (Experimental) modeli ile üst düzey analiz ve karar yeteneği.
- **Tam Rusça Yerelleştirme (YENİ):** Tüm iş emirleri, ürün isimleri ve teknik detaylar artık otomatik olarak Rusça'ya çevrilir. Üretim personeli için %100 Rusça dokümantasyon sağlanır.
- **Sanal Personel & Test Modu:** Geliştirme aşaması için 6 sanal test personeli (Dikiş, Döşeme, Boya) tanımlandı. Marina koordinasyonunda testler yürütülebilir.
- **Miktar Bazlı Bölüştürme & Rusça Bildirim:** Koordinatör (Marina), üretimi personeller arasında Rusça notlar (РАСПРЕДЕЛЕНО) ile adet bazlı dağıtabilir.
- **Sıkı Takip Döngüsü:** 
  - **5 Gün Kuralı:** Teslimata 5 gün kala başlayan ve 3 gün kalana kadar süren günlük periyodik takip.
  - **24 Saat Kuralı:** Kritik gecikmeleri ve kumaş siparişlerini anlık olarak Marina'ya raporlar.

## 🛠️ Teknoloji Yığını
- **Çekirdek:** Node.js, TypeScript
- **Bot Framework:** Grammy (Telegram)
- **Veritabanı:** Supabase (PostgreSQL)
- **Yapay Zeka:** OpenAI SDK via OpenRouter (Gemini 2.0 Pro)
- **Dosya İşleme:** ExcelJS, XlsxUtils

## 📂 Dosya Yapısı
- `src/`: Uygulama kaynak kodları.
- `kaya/memory/core_memory.md`: Ayça'nın "Anayasası" ve tek hafıza kaynağı.
- `archive/`: Geçmiş loglar ve raporlar (Local).
- `simulate_order.ts`: Üretim simülasyonu ve test aracı.

---
_Bu proje Barış Bey'in (Sandaluci) vizyonuyla Ayça tarafından yönetilmektedir._

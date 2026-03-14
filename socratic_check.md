# Sokratik Gerçeklik Kontrolü (5 Adımlı) - Asistan V2 Refaktör

> [!NOTE]
> Bu kontrol `GEMINI.md` kuralları gereği her operasyon öncesi zorunludur.

## 1. Problem ve Kapsam Analizi

**Mevcut Durum:** `OrderService` yaklaşık 1700 satırlık devasa bir dosya. PDF üretimi, DB işlemleri ve iş mantığı iç içe geçmiş durumda.
**Hedef:** Bu yapıyı modüler hale getirmek (Option 2) ve ardından hataya dayanıklılığı artırmak (Option 3).

## 2. Kısıtlar ve Teknik Sınırlar

- **TypeScript:** Strict mode şart, `any` kullanımı yasak.
- **Dil:** Kod ve yorumlar İngilizce, kullanıcı iletişimi ve düşünce süreci Türkçe.
- **Mimari:** Feature-first veya Layered (Service/Repository) yapısı tercih edilmeli.
- **Bağımlılıklar:** `pdfkit`, `canvas`, `exceljs`, `supabase`, `zod`.

## 3. Hipotez ve Tasarım Seçenekleri

**Hipotez:** `OrderService` dosyasından PDF üretimini ve Veri Erişimini (Data Access) ayırırsak, sistemin bakımı kolaylaşır ve test edilebilirliği artar.

- **A Seçeneği:** Hepsini bir kerede ayırmak (Riskli).
- **B Seçeneği:** Önce `OrderRepository` oluşturup DB mantığını taşımak, sonra `PDFService` ile görsel üretimini ayırmak (Güvenli - Tercih Edilen).

## 4. Risk ve Yan Etki Analizi

- **Risk:** PDF çıktılarının estetiğinin bozulması.
- **Çözüm:** Mevcut koddan mantığı birebir taşıyıp (Golden Rule) çıktıyı doğrulamak.
- **Risk:** Supabase ve yerel JSON arasındaki senkronizasyonun bozulması.
- **Çözüm:** `Repository` katmanında bu geçişi sağlamlaştırmak.

## 5. Doğrulama ve Başarı Kriterleri

- `npx tsc --noEmit` hatasız tamamlanmalı.
- ESLint kurallarına uyulmalı.
- PDF dosyaları beklendiği gibi üretilmeli.
- Kod 2 kez gözden geçirilmeli.

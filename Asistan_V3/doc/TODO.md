# Ayça V3 — Test & Geliştirme TODO Listesi

## Durum: 221/221 test geçiyor (2026-04-28)

### FAZ 1: Dağıtım Split Mode Testleri [x]
- [x] A1: Split parse — "Almira: 20, X: 20" doğru ayrıştırılır
- [x] A2: Toplam miktar aşımı → hata mesajı
- [x] A3: 0 veya negatif miktar → hata mesajı
- [x] A4: Bilinmeyen personel adı → hata mesajı
- [x] A5: 1 personele tam miktar atama
- [x] A6: 3+ personele bölme (Hasan:10, Zhagir:20, Aleksi:20)
- [x] A7: Rusça isimle dağıtım
- [x] A8: Her personele ayrı PDF gider
- [x] A9: Split sonrası draft temizlenir
- [x] A10: Döşemehane split — 3 kişiye bölme
- [x] A11: Dikishane split — 2 kişiye bölme
- [x] A12: Aynı personele 2 kez atama engeli

### FAZ 2: 7 Günlük Hafıza [x]
- [x] maxAgeMs: 3 gün → 7 gün güncelle
- [x] B1: 7 günlük mesaj history'de kalır
- [x] B2: 8 günlük mesaj archive'e taşınır
- [x] B3: Boss mesajları doğru role ile kaydedilir
- [x] B4: Staff mesajları doğru role ile kaydedilir
- [x] B5: Archive append-only çalışır
- [x] B6: Draft 30 dk expire
- [x] B7: 100+ mesaj performansı
- [x] B8: Farklı chatId ayrı history

### FAZ 3: Wiki Bot Entegrasyonu [x]
- [x] handleGeneralMessage'e wiki.query() ekle
- [x] C1: Departman sorusu → wiki bilgisi
- [x] C2: "Marina kim?" → wiki bilgisi
- [x] C3: Dağıtım prosedürü → wiki bilgisi
- [x] C4: Bilinmeyen konu → normal LLM yanıtı
- [x] C5: Wiki lint — orphan sayfa
- [x] C6: Wiki ingest — yeni kaynak
- [x] C7: Wiki log — sorgu kaydı

### FAZ 4: Kaizen Otomasyon [ ]
- [ ] MessageHandler'a kaizenTracker.log() ekle
- [ ] Günlük analyze→optimize→evaluate cron job
- [ ] D1: LLM çağrısı sonrası tracker log
- [ ] D2: Low confidence pattern tespiti
- [ ] D3: Repeated mistake pattern
- [ ] D4: Candidate prompt üretimi
- [ ] D5: +5% iyileşme → activate
- [ ] D6: Düşüş → discard
- [ ] D7: Prompt versiyon izleme
- [ ] D8: Wiki context dahil

### FAZ 5: Sub-Agent Sistemi [ ]
- [ ] Mimari tasarım (Agent interface, TaskQueue, Lifecycle)
- [ ] E1: Stok takip delege
- [ ] E2: Periyodik kontrol (24s)
- [ ] E3: Raporlama
- [ ] E4: Stop komutu
- [ ] E5: Çoklu alt ajan
- [ ] E6: Graceful degradation
- [ ] E7: Marina iş emri
- [ ] E8: Barış Bey rapor görüntüleme

### FAZ 6: Üretim Akış Sırası [x]
- [x] F1: Sipariş girişi → sevkiyat tam akış
- [x] F2: Departman mention sırası
- [x] F3: Marina kalite kontrol onayı
- [x] F4: Safha atlama engeli
- [x] F5: Stok uyarı tetikleme
- [x] F6: Paketleme→Sevkiyat zinciri

### FAZ 7: Stres & Edge Case [x]
- [x] G1: 100+ sipariş performans
- [x] G2: 5 eşzamanlı talep
- [x] G3: 2000+ karakter mesaj
- [x] G4: Özel karakter güvenliği
- [x] G5: Hızlı Excel yükleme
- [x] G6: LLM timeout fallback
- [x] G7: Supabase kopması retry

---

**Son güncelleme:** 2026-04-28
**Toplam:** 221 test (Faz 1-3, 6-7 tamamlandı)
**Kalan:** Faz 4 (Kaizen) + Faz 5 (Sub-Agent) — yeni özellik tasarımı gerekli

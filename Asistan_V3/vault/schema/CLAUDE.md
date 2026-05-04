# CLAUDE.md — Wiki Isletim El Kitabi

## 1. Kural: Cevaptan Once Wiki'yi Oku
Her soruya cevap vermeden once:
1. `index.md`'yi oku → ilgili sayfalari bul
2. Ilgili wiki sayfalarini oku → baglam cek
3. Cevabi bu baglamla olustur
4. Cevaptan sonra ilgili wiki sayfalarini guncelle + log.md'ye kaydet

## 2. Kural: Izinsiz Guncelle
Anlamli her etkilesimden sonra vault'u guncelle, log.md'ye kayit dustur.
"Vault'u guncelleyeyim mi?" diye sorma — dogrudan yap.

## 3. Kural: Geri Donusumsuz Mudahale Icin Danis
Sadece sunlar icin izin iste:
- Sayfa birlestirme
- Sayfa silme
- Buyuk capli tasimeler

## 4. Vault Yapisi

```
vault/
  raw/          # Dokunulmaz kaynaklar (email, excel, konusma, politika)
  wiki/         # LLM-uretimi markdown sayfalari
    index.md    # Sayfa katalogu
    log.md      # Kronolojik olay gunlugu
  schema/       # Bu dosya — isletim kurallari
```

## 5. Sayfa Sablonu

Her wiki sayfasi su frontmatter'i icermelidir:

```yaml
---
slug: departments/karkas
title: Karkas Uretimi
type: department | order | person | procedure | product
tags: [karkas, uretim, departman]
created: 2026-04-22
updated: 2026-04-22
sources: []
---
```

Sayfa govdesi su bolumleri icermelidir:
- **Ozet**: Bir paragraf
- **Detaylar**: Yapilandirilmis icerik
- **Iliskili**: `[[_diger-sayfa_]]` wikilink'leri

## 6. Log Formati

```markdown
## [YYYY-AA-GG] ingest|query|lint | Baslik
- Ne yapildi
- Hangi sayfalar etkilendi
```

## 7. Wikilink Kurallari
- Tek yonlu: `[[_sayfa-adi_]]`
- Cift yonlu: Her sayfanin sonunda `## Baglantilar` bolumu olmali
- Link hedefi yoksa, sayfa olusturulmayi bekleyen "kirmizi link" olarak isaretlenir

## 8. Celiski Yonetimi
Celiski ciktiginda ustunu ortme — ikisini de tut:
```markdown
> **CELISKI**: [tarih] iddia A vs iddia B
> Kaynak 1: [[kaynak-sayfasi-1]] (2026-04-20)
> Kaynak 2: [[kaynak-sayfasi-2]] (2026-04-22)
```

## 9. Ingest/Query/Lint Akislari

### Ingest
1. Kaynagi `raw/` dizinine kaydet
2. LLM ile icerik cikar ve yapilandir
3. Ilgili wiki sayfalarini olustur/guncelle
4. `index.md` katalogunu guncelle
5. `log.md`'ye kayit dustur

### Query
1. `index.md`'yi oku
2. Tam metin + anlamsal arama yap
3. Ilgili sayfalari oku
4. Kaynakli cevap olustur
5. Iyi sorular icin cevabi wiki sayfasina geri yaz

### Lint (her ~10 oturumda bir)
- Oksuz sayfalar (gelen link yok)
- Tarihi gecmis iddialar
- Kopuk capraz referanslar
- Sayfasi olmayan kavramlar
- Sonraki sorular onerileri

## 10. Canli Belge
Bu dosya tasla kazinmis degil — neyin isledigini gordukce ustune yaz.

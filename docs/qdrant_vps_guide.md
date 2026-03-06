# Qdrant VPS Bağlantı Rehberi

Bu rehber, Qdrant vektör veritabanını bir VPS üzerinde çalıştırırken karşılaşılan yaygın bağlantı sorunlarını çözmek ve diğer programların bu servis ile sağlıklı iletişim kurmasını sağlamak amacıyla hazırlanmıştır.

## 1. Ağ Yapılandırması (Networking)

### Aynı VPS Üzerinde (Docker-Compose)

Eğer asistan uygulamanız ve Qdrant aynı Docker ağındaysa, bağlantı için konteyner adını kullanmalısınız:

- **URL:** `http://qdrant:6333`
- **Neden?** Docker iç ağında konteyner adları otomatik olarak IP'ye çözümlenir.

### Farklı Sunuculardan Erişim (Dış Bağlantı)

Eğer başka bir sunucudan bağlanıyorsanız:

- **URL:** `https://vps-ip-adresi:6333` (SSL varsa) veya `http://vps-ip-adresi:6333`
- **Firewall Check:** VPS üzerindeki firewall'da (UFW/Iptables) 6333 ve 6334 portlarının açık olduğundan emin olun.
  ```bash
  sudo ufw allow 6333/tcp
  sudo ufw allow 6334/tcp
  ```

## 2. SSL/TLS ve Sertifika Sorunları

VPS üzerinde genellikle "Self-Signed" (kendinden imzalı) sertifikalar kullanılır. Bu durum Node.js'de `UNABLE_TO_VERIFY_LEAF_SIGNATURE` hatasına neden olur.

**Çözüm:**

- `.env` dosyanıza şu satırı ekleyin (Sadece geliştirme/özel sunucu için):
  ```env
  NODE_TLS_REJECT_UNAUTHORIZED=0
  ```
- Ya da `QdrantClient` yapılandırmasında sertifika doğrulamasını devre dışı bırakın.

## 3. API Key Güvenliği

Qdrant VPS kurulumunda API Key varsayılan olarak kapalı olabilir. `config.yaml` dosyasından veya Docker ortam değişkenlerinden aktif edilmelidir:

- **Ortam Değişkeni:** `QDRANT__SERVICE__API_KEY=senin_guclu_anahtarin`

## 4. REST vs gRPC

- **REST (6333):** Standart HTTP protokolüdür, hata ayıklaması kolaydır. Çoğu zaman yeterlidir.
- **gRPC (6334):** Daha hızlı ve performanslıdır ancak HTTP/2 desteği ve bazen karmaşık proxy ayarları gerektirir.

**Tavsiye:** Sorun yaşıyorsanız önce REST (6333) üzerinden bağlantıyı stabil hale getirin.

## 5. Hata Ayıklama (Debugging)

Bağlantı sorunlarını anlamak için sunucu üzerinden şu komutu çalıştırarak portun dinlenip dinlenmediğini kontrol edin:

```bash
curl http://localhost:6333/healthz
```

Eğer "ok" cevabı alıyorsanız Qdrant çalışıyor demektir. Dışarıdan erişemiyorsanız sorun firewall veya ağ yapılandırmasındadır.

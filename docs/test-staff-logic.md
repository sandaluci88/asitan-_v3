# Test Personeli (Staff) Mantığı ve Yönlendirmeler

Bu belge, Telegram bot tarafında sipariş dağıtımları sırasında **"Test Modu"** olarak çalışan personel yönlendirmelerini açıklamak için oluşturulmuştur.

## 1. Problem

Bot üzerinden "Yeni Sipariş" (PDF veya Butonlarla) oluşturulduğunda, sistem işi yapacak ilgili departmandan personel arar. Eğer veritabanında (Supabase) o departmana kayıtlı herhangi bir personel yoksa sistem tıkanır, hata verir ve sipariş süreci test edilemez.

## 2. Çözüm (Yedekleme/Fallback Mekanizması)

Bunu önlemek ve testleri baştan sona (SuperAdmin/Supervisor rolünden İşçi rolüne kadar) yapabilmek için `src/utils/staff.service.ts` dosyasında bir "Yedek (Fallback)" mekanizması kurulmuştur.

### 2.1. getStaffByDepartment Davranışı

Sistem bir departmana (örneğin "Kumaş", "Dikişhane", "Paketleme") personel atamak istediğinde ve kimseyi bulamadığında:

1. `.env` dosyasından `TELEGRAM_CHAT_ID` değerini (Yani sizin ID'niz: `6030287709`) çeker.
2. Otomatik ve sanal bir personel nesnesi oluşturur.
3. Personelin adını **"Test Ustası (Departman Adı)"** (Örn: "Test Ustası (Dikişhane)") olarak belirler.
4. İşi bu sanal kullanıcıya (Yani doğrudan sizin Telegram ID'nize) atar.

Böylece işçi butonları (Örn: "Kumaş Geldi", "Eksik Kumaş Bildir") veya ilgili bildirimler sizin Telegram hesabınıza düşer.

### 2.2. getStaffByName Davranışı

İşlem tamamlanıp sistem personeli ismiyle aradığında (Test Ustası loglarını eşleştirmek için):

1. Aranan isim `"Test Ustası"` ile başlıyorsa,
2. Yine çevresel değişkenlerden `.env` `TELEGRAM_CHAT_ID` değerini alır,
3. Test yöneticisine sanal olarak oluşturduğu aynı Telegram ID'siyle yanıt döner.

## 3. Özeti

- Supabase'de gerçek bir çalışan kaydı **olmasa bile**, sistem durmaz.
- Tüm "sahipsiz" iş emirleri `TELEGRAM_CHAT_ID` kime aitse ona gider (Şu anda size).
- Üretime (Production) çıkmadan önce veya gerçek çalışanlar sisteme eklendiğinde bu test mantığına ihtiyaç kalmayacaktır. Çünkü sistem departmanda gerçek bir çalışan bulduğunda bu "Test Ustası" mantığı devreye **girmez**.

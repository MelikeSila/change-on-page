# Sayfa Değişiklik Takipçi (change-on-page)

İzlediğiniz web sayfalarındaki içerik değişikliklerini otomatik olarak tespit eden,
tarayıcıda anlık bildirim gösteren ve **istediğiniz e-posta adreslerine mail gönderen**
Node.js tabanlı bağımsız bir araç.

Özellikle sınav/sınav sonucu, duyuru gibi **anlık güncellenen** sayfaları
(kapasite, kontenjan, sonuç açıklanma) takip etmek için tasarlanmıştır.

---

## Özellikler

- **Otomatik takip**: Belirlediğiniz sıklıkla sayfayı yeniden indirir ve **SHA-256 hash** ile karşılaştırır.
- **Değişiklik farkı**: Hash değiştiğinde sayfanın metnini çıkarır; **eklenen / kaldırılan** satırları gösterir.
- **Anlık bildirim (SSE)**: Değişiklik olduğunda arayüz hemen güncellenir + sesli uyarı.
- **E-posta bildirimi**: Sayfa başına tanımladığınız alıcılara içerik farkıyla birlikte mail gönderir.
- **Test butonu**: Ayarları denemek için tek tıkla test maili gönderir.
- **Kalıcı veri**: İzlenen sayfalar ve alıcılar `data.json` dosyasında saklanır; sunucu yeniden başlayınca **otomatik geri yüklenir**.
- **Dinamik ayarlar**: Kontrol aralığını ve alıcıları **sonradan** değiştirebilirsiniz.
- **Çoklu sayfa**: Aynı anda sınırsız sayfa izlenebilir; her biri kendi aralığı ve alıcılarıyla.

---

## Teknoloji

| Paket | Kullanım |
|-------|----------|
| `express` | Web sunucusu ve REST uçları |
| `axios` | Sayfa indirme (HTTP istekleri) |
| `cheerio` | HTML'den metin ayıklama |
| `nodemailer` | SMTP ile mail gönderme |
| `dotenv` | `.env` dosyasından gizli ayar okuma |

**SSE (Server-Sent Events)** ile tarayıcıya anlık bildirim gönderilir (polling yok).

---

## Gereksinimler

- **Node.js 18+** (test edildi: v24)
- npm
- (İsteğe bağlı) Mail bildirimi için bir SMTP hesabı (Gmail, Yandex, kurumsal mail vb.)

---

## Kurulum

```bash
git clone <repo-url>
cd change-on-page
npm install
```

---

## Yapılandırma (`.env`)

Gizli bilgiler **`.env`** dosyasındadır. Bu dosya `.gitignore`'a eklenmiştir ve
**asla git'e girmez**. Ayarlamak için şablonu kopyalayın:

```bash
cp .env.example .env
```

Sonra `.env` dosyasını düzenleyin:

```env
# Sunucu portu
PORT=3000

# Mail bildirimleri (SMTP giriş bilgileri - GİZLİ tutun)
MAIL_ENABLED=true
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=seninmail@gmail.com
MAIL_PASS=uygulama-sifresi
MAIL_FROM=seninmail@gmail.com

# Opsiyonel: alıcı girilmeyen sayfalar için varsayılan alıcılar
MAIL_TO=
```

### Gmail ile mail gönderme

Normal Gmail şifresi **çalışmaz**. Bir **Uygulama Şifresi** alın:

1. [myaccount.google.com](https://myaccount.google.com) → **Güvenlik**
2. **2 Adımlı Doğrulama**'yı açın
3. **Uygulama şifreleri** → [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)
4. **Posta** + **Diğer** → oluşturun
5. Çıkan **16 haneli** kodu `MAIL_PASS` değerine yazın

| Sağlayıcı | MAIL_HOST | MAIL_PORT | MAIL_SECURE |
|-----------|-----------|-----------|-------------|
| Gmail | `smtp.gmail.com` | `587` | `false` |
| Gmail (SSL) | `smtp.gmail.com` | `465` | `true` |
| Yandex | `smtp.yandex.com` | `465` | `true` |
| Outlook | `smtp-mail.outlook.com` | `587` | `false` |
| Test (Mailtrap) | `sandbox.smtp.mailtrap.io` | `2525` | `false` |

> **Not:** `MAIL_PASS` (şifre) **sadece** `.env`'dedir; arayüzde hiçbir yerde istenmez,
> hiçbir API üzerinden geri okunmaz. Alıcı adresleri ise **arayüzden** girilir ve
> `.env`'de değil, `data.json`'da tutulur.

---

## Çalıştırma

```bash
npm start
```

Ardından tarayıcıda açın:

```
http://localhost:3000
```

Açılışta konsola durum yazılır:

```
Sunucu çalışıyor: http://localhost:3000
Mail bildirimi aktif. Alıcılar arayüzden girilir.
```

---

## Kullanım

1. **"+ Yeni Sayfa Ekle"** formunu doldurun:
   - **İsim**: Hatırlatıcı bir ad (ör: `TUS 2. Dönem Sonuçları`)
   - **URL**: İzlenecek sayfanın adresi
   - **Aralık**: Kontrol sıklığı (10 sn → 1 saat arası)
   - **Bildirim e-postaları**: Bu sayfa için alıcılar (virgülle ayırın, boşsa mail gitmez)
2. **Takibe Al**'a tıklayın.
3. (İsteğe bağlı) **📧 Test Maili** ile girdiğiniz adreslere deneme maili gönderin.

### Kart üzerindeki kontroller

| Kontrol | İşlev |
|---------|-------|
| **Aralık dropdown** | Kontrol sıklığını sonradan değiştirir (10sn / 15sn / 30sn / 1dk / 2dk / 5dk / 30dk / 1 saat) |
| **📧 Mail** | Bu sayfanın alıcılarını düzenler |
| **⏸ Durdur / ▶ Devam** | Takibi geçici olarak duraklatır / sürdürür |
| **✕ Sil** | Sayfayı ve kayıtlı verisini kaldırır (veri dosyasından da silinir) |

---

## Nasıl çalışır?

1. `axios` ile sayfa HTML'i indirilir.
2. `cheerio` ile `<script>`, `<style>` vb. gürültü temizlenip **yalnızca metin** satırları çıkarılır.
3. Bu satırların SHA-256 hash'i alınır; **önceki hash** ile karşılaştırılır.
4. Hash değiştiyse:
   - Eski metinle yeni metin **farklanır** → eklenen/kaldırılan satırlar bulunur.
   - Arayüze `change` olayı gönderilir (SSE).
   - `mailConfig.defaultTo` veya sayfanın alıcılarına **mail** gönderilir.
5. Sonuç `data.json`'a kaydedilir.

İlk kontrol **takip başlatıldığı anda** yapılır; sonrakiler seçilen aralıkta tekrarlanır.

---

## API Uçları

| Metot | Uç | Açıklama |
|-------|----|----------|
| `GET` | `/api/events` | SSE akışı (anlık bildirimler) |
| `GET` | `/api/monitors` | Tüm izlenen sayfaları listeler |
| `POST` | `/api/monitors` | Yeni sayfa ekler `{name, url, interval, emails}` |
| `PATCH` | `/api/monitors/:id/toggle` | Durdur / devam ettir |
| `DELETE` | `/api/monitors/:id` | Sayfayı siler |
| `PATCH` | `/api/monitors/:id/emails` | Alıcıları günceller `{emails}` |
| `PATCH` | `/api/monitors/:id/interval` | Kontrol aralığını günceller `{interval}` |
| `GET` | `/api/mail-status` | Mail servisi hazır mı |
| `POST` | `/api/test-mail` | Test maili gönderir `{emails}` |

---

## Dosya yapısı

```
change-on-page/
├── server.js            # Sunucu, izleme motoru, API
├── public/
│   └── index.html       # Tek sayfa arayüz (SSE + kontrol paneli)
├── .env                 # Gizli ayarlar (GIT'E GİTMEZ)
├── .env.example         # Ayar şablonu (güvenli)
├── data.json            # İzlenen sayfalar + alıcılar (GIT'E GİTMEZ)
├── .gitignore           # Gizli/yerel dosyalar hariç
├── package.json
└── README.md
```

---

## Güvenlik

- **`.env`** (SMTP şifresi) ve **`data.json`** (e-postalar + veri) `.gitignore`'a eklenmiştir; **git'e commit edilmez ve push'lanmaz**.
- Gizli bilgiler yalnızca sunucu tarafında okunur; istemciye (tarayıcıya) **asla gönderilmez**.
- Paylaşılabilir şablon olan `.env.example` sadece örnek değerler içerir.
- Site içeriği **salt okunur** olarak çekilir; hiçbir veri yazılmaz.

Push öncesi her zaman kontrol edebilirsiniz:

```bash
git status                 # .env / data.json görünmemeli
git ls-files | grep -E "\.env$|data.json"   # boş dönmeli
```

---

## Sorun giderme

| Belirti | Çözüm |
|---------|-------|
| "Mail yapılandırılmamış" | `.env` içinde `MAIL_ENABLED=true`, `MAIL_USER`, `MAIL_PASS` dolu mu? |
| "Mail gönderilemedi" | SMTP host/port şifresi doğru mu? Gmail için **uygulama şifresi** kullandınız mı? |
| Alıcı yok uyarısı | Karttaki **📧 Mail**'den alıcı girin |
| Sayfa sürekli "hata" | Site erişime kapalı / engelliyor olabilir; `server.js` içindeki User-Agent'ı güncelleyin |
| Port çakışması | `PORT=3000` başka bir süreçte kullanılıyorsa `.env` içinde değiştirin |

---

## Lisans

MIT

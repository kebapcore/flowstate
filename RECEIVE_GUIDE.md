# FlowCloud Secure File Access Guide (Secondary Servers)

Bu rehber, yetkili ikincil sunucuların (Secondary Servers) FlowCloud ana sunucusundan nasıl güvenli bir şekilde dosya çekebileceğini anlatır.

## Ön Gereksinimler

1.  **SYSTEM_ACCESS_KEY:** Ana sunucu ile aynı anahtara sahip olmalısınız. Bu anahtarı `.env` dosyanıza ekleyin.
2.  **Allowed Host:** Sunucunuzun adresi (Origin), ana sunucudaki `allowed.json` listesinde ekli olmalıdır.

## Kurulum

1.  `flowcloud-auth-helper.js` dosyasını projenize indirin/kopyalayın.
2.  Projenizde `express` ve `node-fetch` (Node 18+ ise yerleşik fetch kullanılır) olduğundan emin olun.

## Kullanım

### 2. Metin Dosyası Çekme (Text/JSON)

Dosyaları okumak için `fetchFromFlowCloud` fonksiyonunu kullanın.

```javascript
const { fetchFromFlowCloud } = require('./flowcloud-auth-helper');

async function dosyaOku() {
  try {
    // Parametreler: (FlowCloud Adresi, Dosya Adı, Sizin Adresiniz)
    const icerik = await fetchFromFlowCloud(
      'https://flowcloud.onrender.com', 
      'flowscript.txt',
      'https://mysite.com'
    );
    
    console.log("Dosya İçeriği:", icerik);
    
  } catch (error) {
    console.error("Hata oluştu:", error.message);
  }
}
```

### 3. Medya Streaming (MP3/Video)

Büyük dosyaları veya medya dosyalarını stream etmek için `getSecureResponse` kullanın.

```javascript
const { getSecureResponse } = require('./flowcloud-auth-helper');
const { Readable } = require('stream'); // Node.js Stream modülü

app.get('/muzik-dinle', async (req, res) => {
  try {
    // Ham Response nesnesini al
    const response = await getSecureResponse(
      'https://flowcloud.onrender.com', 
      'muzik.mp3',
      'https://mysite.com'
    );

    // Headerları kopyala (Content-Type, Content-Length vb.)
    res.setHeader('Content-Type', response.headers.get('content-type') || 'audio/mpeg');
    if (response.headers.get('content-length')) {
      res.setHeader('Content-Length', response.headers.get('content-length'));
    }

    // Stream'i pipe et (Node 18+ fetch body WebStream döner, Node Stream'e çeviriyoruz)
    // Eğer node-fetch kullanıyorsanız response.body.pipe(res) yeterli olabilir.
    if (response.body && typeof response.body.pipe === 'function') {
        response.body.pipe(res);
    } else {
        Readable.fromWeb(response.body).pipe(res);
    }

  } catch (error) {
    res.status(500).send("Hata: " + error.message);
  }
});
```

## Güvenlik Mantığı (Nasıl Çalışır?)

1.  **İmzalı İstek (Signed Request):** Helper fonksiyonu, isteği göndermeden önce `SYSTEM_ACCESS_KEY` kullanarak bir imza oluşturur.
2.  **Header:** Bu imza (`x-flowcloud-signature`) ve zaman damgası (`x-flowcloud-date`) isteğin başlığına eklenir.
3.  **Doğrulama:** FlowCloud sunucusu gelen imzayı kontrol eder.
    *   İmza doğruysa (yani şifreyi biliyorsanız),
    *   Zaman damgası yeniyse (5 dakika içinde),
    *   Ve Origin'iniz izinli listedeyse...
4.  **Sonuç:** Dosya gönderilir.

**Avantajı:** Sunucunuzun dışarıya açık bir endpoint (`/flowcloud-auth`) kurmasına gerek kalmaz. Şifre asla ağ üzerinden gönderilmez.

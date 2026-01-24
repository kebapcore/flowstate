const crypto = require('crypto');

// Modül seviyesinde origin'i saklamak için
let _configuredOrigin = null;

/**
 * FlowCloud Auth Helper
 * 
 * Bu modül, FlowCloud ile güvenli iletişim kurmak isteyen diğer sunucular için
 * gerekli olan imzalama işlemlerini otomatik yapar.
 * 
 * Kullanım:
 * 1. Projenizin .env dosyasına SYSTEM_ACCESS_KEY ekleyin.
 * 2. Bu dosyayı projenize dahil edin.
 * 3. fetchFromFlowCloud fonksiyonunu kullanarak dosya çekin.
 */

/**
 * FlowCloud'dan güvenli bir şekilde dosya isteği yapar ve ham Response nesnesini döner.
 * Stream (MP3, Video vb.) işlemleri için bunu kullanın.
 * 
 * @param {string} flowCloudUrl - FlowCloud sunucu adresi
 * @param {string} filename - İstenen dosya adı
 * @param {string} [manualOrigin] - Opsiyonel origin
 * @returns {Promise<Response>} - Fetch Response nesnesi
 */
async function getSecureResponse(flowCloudUrl, filename, manualOrigin) {
    const targetUrl = `${flowCloudUrl}/api/proxy/files/${filename}`;
    const key = process.env.SYSTEM_ACCESS_KEY;
    const myOrigin = manualOrigin || _configuredOrigin || process.env.RENDER_EXTERNAL_URL || process.env.BASE_URL;

    if (!key) {
        throw new Error('FlowCloud Error: SYSTEM_ACCESS_KEY bulunamadı. .env dosyanızı kontrol edin.');
    }

    if (!myOrigin) {
        throw new Error('FlowCloud Error: "myOrigin" parametresi zorunludur. Kendi sunucu adresinizi belirtmelisiniz.');
    }

    // İmza Oluşturma
    const timestamp = Date.now().toString();
    const payload = `${timestamp}:${filename}`;
    const hmac = crypto.createHmac('sha256', key);
    hmac.update(payload);
    const signature = hmac.digest('hex');

    // Header ekle
    const headers = {
        'X-App-Request': '1',
        'Origin': myOrigin,
        'x-flowcloud-date': timestamp,
        'x-flowcloud-signature': signature
    };

    try {
        const response = await fetch(targetUrl, { headers });

        if (!response.ok) {
            throw new Error(`FlowCloud Error: ${response.status} ${response.statusText}`);
        }

        return response;
    } catch (error) {
        console.error('❌ FlowCloud Fetch Error:', error.message);
        throw error;
    }
}

/**
 * FlowCloud'dan dosya çekmek için yardımcı fonksiyon (Metin dosyaları için)
 * @param {string} flowCloudUrl - FlowCloud sunucu adresi (örn: https://flowcloud.onrender.com)
 * @param {string} filename - İstenen dosya adı
 * @param {string} myOrigin - Kendi sunucu adresiniz (örn: https://mysite.com). Bu adres FlowCloud'da allowed.json içinde olmalıdır.
 * @returns {Promise<string>} - Dosya içeriği (Text)
 */
async function fetchFromFlowCloud(flowCloudUrl, filename, myOrigin) {
    const response = await getSecureResponse(flowCloudUrl, filename, myOrigin);
    return await response.text();
}

module.exports = {
    fetchFromFlowCloud,
    getSecureResponse
};

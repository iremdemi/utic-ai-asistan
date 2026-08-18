// UTİC AI Asistanı — Paylaşılan güvenlik yardımcıları
// 1) CORS: sadece utic.info (ve Netlify önizleme alan adları) istek atabilir.
// 2) Hız sınırlama: aynı IP'den kısa sürede çok fazla istek gelirse reddeder,
//    Gemini bütçesinin kötüye kullanımla tüketilmesini engeller.

const { getStore, connectLambda } = require("@netlify/blobs");

const ALLOWED_ORIGINS = ["https://utic.info", "https://www.utic.info"];

function resolveCorsOrigin(event) {
  const origin = (event.headers && (event.headers.origin || event.headers.Origin)) || "";
  const isAllowed =
    ALLOWED_ORIGINS.includes(origin) || /^https:\/\/[a-z0-9-]+\.netlify\.app$/.test(origin);
  return isAllowed ? origin : ALLOWED_ORIGINS[0];
}

function getClientIp(event) {
  const xnf = event.headers && event.headers["x-nf-client-connection-ip"];
  if (xnf) return xnf;
  const xff = (event.headers && event.headers["x-forwarded-for"]) || "";
  return xff.split(",")[0].trim() || "unknown";
}

// windowMs: zaman penceresi (ms), maxRequests: bu pencerede izin verilen istek sayısı.
// Alt yapıda bir sorun olursa kullanıcıyı engellemek yerine isteğe izin verir (fail-open).
async function checkRateLimit(event, { storeName, windowMs, maxRequests }) {
  try {
    connectLambda(event);
    const ip = getClientIp(event);
    const windowId = Math.floor(Date.now() / windowMs);
    const key = `${ip}:${windowId}`;

    const store = getStore(storeName);
    let current = 0;
    try {
      const existing = await store.get(key, { type: "json" });
      current = (existing && existing.count) || 0;
    } catch (err) {
      current = 0;
    }

    if (current >= maxRequests) {
      return { allowed: false };
    }

    await store.setJSON(key, { count: current + 1 });
    return { allowed: true };
  } catch (err) {
    console.error("Hız sınırlama kontrolü başarısız, istek yine de işleniyor:", err);
    return { allowed: true };
  }
}

module.exports = { resolveCorsOrigin, checkRateLimit, getClientIp };

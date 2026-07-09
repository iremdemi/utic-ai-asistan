// UTİC AI Asistanı — Öneri/Şikayet Kutusu (Listeleme + Okundu İşaretleme)
// İrem'in bölüm başkanlığı için biriken anonim öneri/şikayetleri görebilmesi içindir.
// Basit bir gizli anahtarla korunur: FEEDBACK_ADMIN_KEY ile eşleşmeli.
// GET  -> tüm gönderimleri listeler (?key=...)
// POST -> bir gönderimi okundu olarak işaretler ({ key, id })

const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const adminKey = (process.env.FEEDBACK_ADMIN_KEY || "").trim();
  if (!adminKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Sunucu yapılandırma hatası: FEEDBACK_ADMIN_KEY tanımlı değil." }),
    };
  }

  connectLambda(event);
  const store = getStore("oneri-sikayet");

  if (event.httpMethod === "POST") {
    let payload;
    try {
      payload = JSON.parse(event.body || "{}");
    } catch (err) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "Geçersiz istek gövdesi." }) };
    }

    if (payload.key !== adminKey) {
      return { statusCode: 401, headers, body: JSON.stringify({ error: "Yetkisiz erişim." }) };
    }

    const { id } = payload;
    if (!id) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: "id eksik." }) };
    }

    try {
      const existing = await store.get(id, { type: "json" });
      if (!existing) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: "Bulunamadı." }) };
      }
      await store.setJSON(id, { ...existing, read: true });
      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ success: true }),
      };
    } catch (err) {
      console.error("Okundu işaretleme hatası:", err);
      return { statusCode: 500, headers, body: JSON.stringify({ error: "İşaretlenemedi." }) };
    }
  }

  // GET: listele
  const providedKey = (event.queryStringParameters && event.queryStringParameters.key) || "";
  if (providedKey !== adminKey) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Yetkisiz erişim." }),
    };
  }

  try {
    const { blobs } = await store.list();

    const entries = await Promise.all(
      blobs.map(async (b) => {
        const value = await store.get(b.key, { type: "json" });
        return { id: b.key, read: false, ...value };
      })
    );

    entries.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ entries }),
    };
  } catch (err) {
    console.error("Öneri/şikayet listeleme hatası:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Liste alınamadı." }),
    };
  }
};

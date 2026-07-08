// UTİC AI Asistanı — Öneri/Şikayet Kutusu (Listeleme)
// İrem'in bölüm başkanlığı için biriken anonim öneri/şikayetleri görebilmesi içindir.
// Basit bir gizli anahtarla korunur: ?key=... parametresi FEEDBACK_ADMIN_KEY ile eşleşmeli.

const { getStore } = require("@netlify/blobs");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  const adminKey = (process.env.FEEDBACK_ADMIN_KEY || "").trim();
  const providedKey = (event.queryStringParameters && event.queryStringParameters.key) || "";

  if (!adminKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Sunucu yapılandırma hatası: FEEDBACK_ADMIN_KEY tanımlı değil." }),
    };
  }

  if (providedKey !== adminKey) {
    return {
      statusCode: 401,
      headers,
      body: JSON.stringify({ error: "Yetkisiz erişim." }),
    };
  }

  try {
    const store = getStore("oneri-sikayet");
    const { blobs } = await store.list();

    const entries = await Promise.all(
      blobs.map(async (b) => {
        const value = await store.get(b.key, { type: "json" });
        return { id: b.key, ...value };
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

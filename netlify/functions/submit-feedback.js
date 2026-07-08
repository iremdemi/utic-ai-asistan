// UTİC AI Asistanı — Öneri/Şikayet Kutusu (Gönderme)
// Öğrencinin yazdığı öneri/şikayeti tamamen anonim olarak saklar.
// Hiçbir kimlik bilgisi (isim, IP, cihaz vb.) kaydedilmez.

const { getStore, connectLambda } = require("@netlify/blobs");

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      headers,
      body: JSON.stringify({ error: "Sadece POST isteği kabul edilir." }),
    };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || "{}");
  } catch (err) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Geçersiz istek gövdesi." }),
    };
  }

  const message = (payload.message || "").toString().trim().slice(0, 2000);
  const topic = (payload.topic || "Genel").toString().trim().slice(0, 100);

  if (!message) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Mesaj boş olamaz." }),
    };
  }

  try {
    connectLambda(event);
    const store = getStore("oneri-sikayet");
    const id = Date.now() + "-" + Math.random().toString(36).slice(2, 8);

    // Kasıtlı olarak sadece konu, mesaj ve tarih saklanıyor; hiçbir kimlik
    // bilgisi (IP, cihaz, tarayıcı vb.) burada toplanmıyor.
    await store.setJSON(id, {
      topic: topic || "Genel",
      message,
      date: new Date().toISOString(),
    });

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ success: true }),
    };
  } catch (err) {
    console.error("Öneri/şikayet kaydetme hatası:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Şu anda kaydedilemedi, lütfen tekrar dener misin?" }),
    };
  }
};

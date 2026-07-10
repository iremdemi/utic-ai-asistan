// UTİC AI Asistanı — Öneri/Şikayet Kutusu (Gönderme)
// Öğrencinin yazdığı öneri/şikayeti tamamen anonim olarak saklar.
// Hiçbir kimlik bilgisi (isim, IP, cihaz vb.) kaydedilmez.
// Yeni bir gönderim geldiğinde ilgili hocalara/geliştiriciye bilgilendirme e-postası atılır.

const { getStore, connectLambda } = require("@netlify/blobs");

const NOTIFY_EMAILS = [
  "irem.demir9@ogr.sakarya.edu.tr",
  "oylume@sakarya.edu.tr",
];

async function sendNotificationEmail(topic, message) {
  const apiKey = (process.env.RESEND_API_KEY || "").trim();
  const fromAddress = (process.env.RESEND_FROM || "").trim();
  const adminKey = (process.env.FEEDBACK_ADMIN_KEY || "").trim();
  if (!apiKey || !fromAddress) {
    console.log("Resend yapılandırılmamış (RESEND_API_KEY veya RESEND_FROM eksik), e-posta atlanıyor.");
    return;
  }

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromAddress,
        to: NOTIFY_EMAILS,
        subject: `Tico Öneri/Şikayet Kutusu: ${topic || "Genel"}`,
        html: `<p>UTİC AI Asistanı (Tico) üzerinden anonim yeni bir öneri/şikayet gönderildi.</p>
<p><strong>Konu:</strong> ${topic || "Genel"}</p>
<p><strong>Mesaj:</strong><br>${message.replace(/\n/g, "<br>")}</p>
<p style="color:#888;font-size:12px;">Bu e-posta otomatik gönderilmiştir, gönderenin kimliği sistemde tutulmamaktadır.</p>
<hr style="border:none;border-top:1px solid #eee;margin:16px 0;">
<p style="font-size:13px;">Tüm gönderimleri görmek için: <a href="https://utic.info/admin-feedback.html">utic.info/admin-feedback.html</a></p>
<p style="font-size:13px;">Erişim şifresi: <strong>${adminKey || "(henüz tanımlanmamış)"}</strong></p>`,
      }),
    });
  } catch (err) {
    // E-posta gönderilemese bile şikayetin kendisi zaten kaydedildi, bu yüzden
    // burada hata fırlatmıyoruz, sadece logluyoruz.
    console.error("Bildirim e-postası gönderilemedi:", err);
  }
}

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

    // Kasıtlı olarak sadece konu, mesaj, tarih ve okunma durumu saklanıyor;
    // hiçbir kimlik bilgisi (IP, cihaz, tarayıcı vb.) burada toplanmıyor.
    await store.setJSON(id, {
      topic: topic || "Genel",
      message,
      date: new Date().toISOString(),
      read: false,
    });

    await sendNotificationEmail(topic, message);

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

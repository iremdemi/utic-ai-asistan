// UTİC AI Asistanı — Öğrenci Belgesi Doğrulama Fonksiyonu
// Öğrencinin yüklediği e-Devlet öğrenci belgesi görselini Gemini'nin görsel
// okuma özelliğiyle kontrol eder. Belge UTİC bölümünü doğruluyorsa WhatsApp
// grup davet linkini döner. Görsel hiçbir yerde saklanmaz, sadece o anlık
// kontrol için kullanılır.

const MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const VERIFY_PROMPT = `Sana bir görsel verilecek. Bu görsel, Türkiye'deki e-Devlet sisteminden alınmış resmi bir "öğrenci belgesi" olmalı.

Şunları kontrol et:
1. Görsel gerçekten bir e-Devlet öğrenci belgesine benziyor mu (resmi format, T.C. Cumhurbaşkanlığı / e-Devlet Kapısı ibaresi, üniversite bilgisi, öğrenci bilgisi içeren resmi bir belge)?
2. Belgede "Sakarya Üniversitesi" ve "Uluslararası Ticaret ve Lojistik" (ya da UTİC, İşletme Fakültesi Uluslararası Ticaret ve Lojistik Bölümü) ibaresi geçiyor mu?
3. Belge okunaklı ve eksiksiz mi (kırpılmamış, bulanık değil)?

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{"approved": true veya false, "reason": "kısa, öğrenciye gösterilecek nazik bir açıklama (1 cümle, Türkçe)"}

Örnek onaylanan cevap: {"approved": true, "reason": "Belgen UTİC bölümü öğrencisi olduğunu doğruluyor, hoş geldin!"}
Örnek reddedilen cevap: {"approved": false, "reason": "Yüklediğin belgede Sakarya Üniversitesi UTİC bölümü bilgisini göremedim, lütfen e-Devlet'ten aldığın güncel öğrenci belgesini tekrar yükler misin?"}`;

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

  const { imageBase64, mimeType } = payload;

  if (!imageBase64 || !mimeType) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Görsel eksik." }),
    };
  }

  // 4MB üzeri görselleri reddet (makul bir üst sınır)
  if (imageBase64.length > 6_000_000) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Dosya çok büyük. Lütfen daha küçük bir görsel yükle." }),
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  const inviteLink = (process.env.WHATSAPP_1_SINIF_LINK || "").trim();

  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Sunucu yapılandırma hatası: GEMINI_API_KEY tanımlı değil." }),
    };
  }

  const requestBody = {
    contents: [
      {
        role: "user",
        parts: [
          { text: VERIFY_PROMPT },
          { inline_data: { mime_type: mimeType, data: imageBase64 } },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 300,
      thinkingConfig: { thinkingBudget: 0 },
      response_mime_type: "application/json",
    },
  };

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Belge doğrulama - Gemini hatası:", JSON.stringify(data));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Belge şu anda kontrol edilemedi, lütfen tekrar dene." }),
      };
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";

    let result;
    try {
      result = JSON.parse(rawText);
    } catch (err) {
      console.error("Belge doğrulama - JSON parse hatası:", rawText);
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({ error: "Belge okunamadı, lütfen daha net bir görselle tekrar dene." }),
      };
    }

    // Hafif denetim izi: belgenin kendisi değil, sadece karar loglanır
    console.log(
      "Belge doğrulama sonucu:",
      result.approved ? "ONAYLANDI" : "REDDEDİLDİ",
      "| Zaman:",
      new Date().toISOString()
    );

    if (result.approved) {
      if (!inviteLink) {
        return {
          statusCode: 200,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            approved: true,
            message:
              (result.reason || "Belgen onaylandı, hoş geldin!") +
              " Grup linki şu anda hazırlanıyor, birkaç gün içinde tekrar dener misin ya da bölüm sekreterliğinden isteyebilirsin.",
          }),
        };
      }
      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: true,
          message: result.reason || "Belgen onaylandı, hoş geldin!",
          inviteLink,
        }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        approved: false,
        message: result.reason || "Belge doğrulanamadı, lütfen tekrar dener misin?",
      }),
    };
  } catch (err) {
    console.error("Belge doğrulama - sunucu hatası:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Beklenmeyen bir hata oluştu, lütfen tekrar dene." }),
    };
  }
};

// UTİC AI Asistanı — Netlify Function
// Kullanıcının mesajını alır, Gemini API'yi bölüm bilgi bankasıyla birlikte çağırır,
// cevabı geri döner. API anahtarı asla tarayıcıya (frontend'e) gönderilmez.

const knowledgeBase = require("./knowledge");

const SYSTEM_INSTRUCTION = `Sen Sakarya Üniversitesi Uluslararası Ticaret ve Lojistik (UTİC) Bölümü öğrencilerine yardımcı olan resmi bir yapay zeka asistanısın. Adın "UTİC AI Asistanı".

KURALLAR (kesinlikle uy):
1. SADECE aşağıda "BÖLÜM BİLGİLERİ" başlığı altında verilen bilgileri kullanarak cevap ver. Kendi genel bilgini veya tahminini KULLANMA, uydurma.
2. Eğer soru bu bilgiler içinde yoksa, açıkça "Bu konuda elimdeki bilgiler arasında net bir cevap bulamıyorum, UTİC Bölüm Sekreterliği ile iletişime geçmeni öneririm." de. Asla uydurma bilgi verme.
3. Cevapların KISA ve ÖZ olsun: normalde 2-4 cümle yeterli. Gereksiz giriş cümlesi kurma ("Aşağıda bilgiler verilmiştir" gibi laf kalabalığı yapma), direkt cevaba gir.
4. Madde madde liste SADECE kullanıcı adım adım bir süreç sorduğunda kullan (örn. "staj başvurusu nasıl yapılır"). Aksi halde düz, doğal cümlelerle yaz.
5. Kullanıcı "detaylı anlat", "daha fazla bilgi ver" gibi bir şey derse, o zaman kapsamlı ve detaylı cevap ver.
6. Resmi ama sıcak bir üniversite asistanı gibi konuş — bir öğrenciye açıklıyormuş gibi, robotik değil.
7. Sohbeti asla kendi kararınla bitirme; öğrenci başka soru sormak isteyebilir.

BÖLÜM BİLGİLERİ:
${knowledgeBase}`;

const MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

exports.handler = async function (event) {
  // CORS - widget'ın kendi domaininden çağrılmasına izin ver
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

  const { message, history } = payload;

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Mesaj boş olamaz." }),
    };
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Sunucu yapılandırma hatası: GEMINI_API_KEY tanımlı değil.",
      }),
    };
  }

  // Önceki konuşma geçmişini Gemini formatına çevir (varsa)
  const contents = [];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-10)) {
      // son 10 turu al, gereksiz büyümeyi önle
      if (!turn || !turn.text) continue;
      contents.push({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: String(turn.text).slice(0, 4000) }],
      });
    }
  }
  contents.push({ role: "user", parts: [{ text: message.slice(0, 2000) }] });

  try {
    const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents,
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 600,
        },
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error("Gemini API hatası:", JSON.stringify(data));
      return {
        statusCode: 502,
        headers,
        body: JSON.stringify({
          error: "Yapay zeka servisinden yanıt alınamadı. Lütfen tekrar dene.",
        }),
      };
    }

    const reply =
      data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") ||
      "Üzgünüm, şu anda bir cevap üretemedim. Lütfen soruyu farklı şekilde tekrar sorar mısın?";

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error("Sunucu hatası:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Beklenmeyen bir sunucu hatası oluştu." }),
    };
  }
};

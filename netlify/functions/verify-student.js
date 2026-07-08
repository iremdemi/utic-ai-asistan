// UTİC AI Asistanı — Öğrenci Belgesi Doğrulama Fonksiyonu
// 1. Adım: e-Devlet öğrenci belgesini okur, UTİC bölümünü ve sınıfı tespit eder.
//   - 1. sınıfsa: direkt onay, WhatsApp linki verilir.
//   - 2/3/4. sınıfsa: reddedilmez, ikinci bir belge (not döküm/transkript) istenir.
// 2. Adım (sadece üst sınıflar için): transkriptte 1. sınıf derslerinden
//   kalmış (FF/FD/DZ vb.) bir ders var mı kontrol edilir, varsa onaylanır.
// Hiçbir görsel sunucuda saklanmaz, sadece anlık kontrol için kullanılır.

const MODEL = "gemini-2.5-flash";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`;

const FIRST_YEAR_COURSES = [
  "İşletme Bilimine Giriş (ISL 101)",
  "Hukuka Giriş (ISL 121)",
  "Genel Muhasebe (ISL 113)",
  "İşletme Matematiği (ISL 111)",
  "Ekonomi Bilimine Giriş (UTC 101)",
  "Mesleki İngilizce I (UTC 104)",
  "Yönetim ve Organizasyon (UTC 102)",
  "İthalat - İhracat Yönetimi (UTC 106)",
  "Makro İktisat (UTC 110)",
  "Teknoloji ve Uluslararası Ticaret (UTC 112)",
];

const STEP1_PROMPT = `Sana bir görsel verilecek. Bu görsel, Türkiye'deki e-Devlet sisteminden alınmış resmi bir "öğrenci belgesi" olmalı.

Şunları kontrol et:
1. Görsel gerçekten bir e-Devlet öğrenci belgesine benziyor mu (resmi format, T.C. Cumhurbaşkanlığı / e-Devlet Kapısı ibaresi, üniversite ve öğrenci bilgisi içeren resmi bir belge)?
2. Belgede "Sakarya Üniversitesi" ve "Uluslararası Ticaret ve Lojistik" (ya da UTİC, İşletme Fakültesi Uluslararası Ticaret ve Lojistik Bölümü) ibaresi geçiyor mu?
3. Belgede öğrencinin kaçıncı sınıf olduğu yazıyor mu (genelde "Sınıfı" veya "Öğretim Yılı" alanında 1, 2, 3 veya 4 şeklinde belirtilir)?
4. Belge okunaklı ve eksiksiz mi (kırpılmamış, bulanık değil)?

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{"valid": true veya false, "sinif": "1" veya "2" veya "3" veya "4" veya "bilinmiyor", "reason": "kısa, öğrenciye gösterilecek nazik bir açıklama (1 cümle, Türkçe)"}`;

function buildStep2Prompt() {
  return `Sana bir görsel verilecek. Bu görsel, Türkiye'deki e-Devlet sisteminden alınmış resmi bir "not döküm belgesi" (transkript) olmalı, Sakarya Üniversitesi Uluslararası Ticaret ve Lojistik (UTİC) bölümüne ait olmalı.

Bu öğrenci 1. sınıf değil, üst sınıf. Grubuna katılabilmesi için, transkriptte AŞAĞIDAKİ 1. sınıf derslerinden EN AZ BİRİNDEN kalmış (başarısız, yani notu FF, FD, DZ, DC/DD altı, veya "Başarısız" ibaresi) olması gerekiyor:

${FIRST_YEAR_COURSES.map((c) => "- " + c).join("\n")}

Not: Ders isimleri transkriptte kısaltılmış veya farklı yazılmış olabilir (örn. "İşletme Bil. Giriş" gibi), bu yüzden anlam olarak eşleşmeye dikkat et, birebir aynı yazım arama.

SADECE aşağıdaki JSON formatında cevap ver, başka hiçbir şey yazma:
{"approved": true veya false, "reason": "kısa, öğrenciye gösterilecek nazik bir açıklama (1 cümle, Türkçe), onaylandıysa hangi dersten kaldığını da belirt"}`;
}

async function callGemini(parts, apiKey) {
  const requestBody = {
    contents: [{ role: "user", parts }],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens: 300,
      thinkingConfig: { thinkingBudget: 0 },
      response_mime_type: "application/json",
    },
  };

  const response = await fetch(`${GEMINI_URL}?key=${apiKey}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) {
    console.error("Belge doğrulama - Gemini hatası:", JSON.stringify(data));
    throw new Error("gemini_error");
  }

  const rawText = data?.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return JSON.parse(rawText);
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

  const { imageBase64, mimeType, step } = payload;
  const currentStep = step === 2 ? 2 : 1;

  if (!imageBase64 || !mimeType) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Görsel eksik." }),
    };
  }

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

  const imagePart = { inline_data: { mime_type: mimeType, data: imageBase64 } };

  try {
    if (currentStep === 1) {
      const result = await callGemini([{ text: STEP1_PROMPT }, imagePart], apiKey);

      console.log(
        "Belge doğrulama (1. adım):",
        JSON.stringify({ valid: result.valid, sinif: result.sinif }),
        "| Zaman:",
        new Date().toISOString()
      );

      if (!result.valid) {
        return {
          statusCode: 200,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            approved: false,
            message: result.reason || "Belge doğrulanamadı, lütfen daha net bir görselle tekrar dener misin?",
          }),
        };
      }

      if (result.sinif === "1") {
        const message = result.reason || "Belgen UTİC 1. sınıf öğrencisi olduğunu doğruluyor, hoş geldin!";
        if (!inviteLink) {
          return {
            statusCode: 200,
            headers: { ...headers, "Content-Type": "application/json" },
            body: JSON.stringify({
              approved: true,
              message: message + " Grup linki şu anda hazırlanıyor, birkaç gün içinde tekrar dener misin ya da bölüm sekreterliğinden isteyebilirsin.",
            }),
          };
        }
        return {
          statusCode: 200,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({ approved: true, message, inviteLink }),
        };
      }

      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          approved: false,
          needsSecondDoc: true,
          message:
            "Bu grup öncelikle 1. sınıf öğrencilerimiz için. Ama eğer 1. sınıftan alttan kalan bir dersin varsa, bunu gösteren not döküm belgeni (transkript) yükleyerek yine katılabilirsin. Aşağıdan yükleyebilirsin.",
        }),
      };
    }

    const result = await callGemini([{ text: buildStep2Prompt() }, imagePart], apiKey);

    console.log(
      "Belge doğrulama (2. adım - transkript):",
      result.approved ? "ONAYLANDI" : "REDDEDİLDİ",
      "| Zaman:",
      new Date().toISOString()
    );

    if (result.approved) {
      const message = result.reason || "Transkriptin, 1. sınıftan alttan bir dersin olduğunu gösteriyor, gruba katılabilirsin!";
      if (!inviteLink) {
        return {
          statusCode: 200,
          headers: { ...headers, "Content-Type": "application/json" },
          body: JSON.stringify({
            approved: true,
            message: message + " Grup linki şu anda hazırlanıyor, birkaç gün içinde tekrar dener misin ya da bölüm sekreterliğinden isteyebilirsin.",
          }),
        };
      }
      return {
        statusCode: 200,
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ approved: true, message, inviteLink }),
      };
    }

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        approved: false,
        message: result.reason || "Transkriptinde 1. sınıftan kalan bir ders göremedim, bu yüzden bu grup için uygun görünmüyorsun. Sorularının varsa bölüm sekreterliğine yönlendirebilirim.",
      }),
    };
  } catch (err) {
    console.error("Belge doğrulama - sunucu hatası:", err);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: "Belge şu anda kontrol edilemedi, lütfen tekrar dene." }),
    };
  }
};

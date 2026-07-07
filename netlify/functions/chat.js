// UTİC AI Asistanı — Netlify Function
// Kullanıcının mesajını alır, sorusuyla en alakalı bölüm belgelerini seçip
// Gemini API'yi sadece o belgelerle çağırır (tüm bilgi bankasını değil —
// bu hem hızlandırır hem de zaman aşımı riskini azaltır), cevabı geri döner.
// API anahtarı asla tarayıcıya (frontend'e) gönderilmez.

const knowledgeBase = require("./knowledge");

// ---------- 1. Bilgi bankasını kaynak belgelere göre parçalara ayır ----------
const HEADER_RE = /## KAYNAK: (.+)\n/g;

function splitIntoChunks(text) {
  const matches = [...text.matchAll(HEADER_RE)];
  if (!matches.length) return [{ name: "genel", text }];
  const chunks = [];
  for (let i = 0; i < matches.length; i++) {
    const start = matches[i].index;
    const end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    chunks.push({ name: matches[i][1], text: text.slice(start, end).trim() });
  }
  return chunks;
}

const CHUNKS = splitIntoChunks(knowledgeBase);

// ---------- 2. Soruya göre en alakalı parçaları seç (basit anahtar kelime skorlama) ----------
const TR_MAP = { ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u" };
function normalizeTr(str) {
  return str
    .toLowerCase()
    .replace(/i̇/g, "i")
    .replace(/[çğıöşü]/g, (c) => TR_MAP[c] || c);
}

const STOPWORDS = new Set([
  "ve", "ile", "bir", "bu", "su", "o", "da", "de", "mi", "mı", "mu", "mü",
  "icin", "gibi", "olan", "nedir", "nasil", "ne", "kadar", "hangi", "var",
  "yok", "midir", "misin", "musun", "beni", "bana", "sen", "ben", "acaba",
]);

function extractKeywords(question) {
  return normalizeTr(question)
    .replace(/[^a-z0-9\s]/gi, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function pickRelevantContext(question) {
  const keywords = extractKeywords(question);
  if (!keywords.length) return knowledgeBase; // anahtar kelime yoksa güvenli varsayılan: tüm bilgi

  const scored = CHUNKS.map((c) => {
    const normContent = normalizeTr(c.text);
    let score = 0;
    for (const kw of keywords) {
      score += normContent.split(kw).length - 1;
    }
    return { ...c, score };
  }).sort((a, b) => b.score - a.score);

  const matched = scored.filter((c) => c.score > 0).slice(0, 7);
  if (!matched.length) return knowledgeBase; // hiç eşleşme yoksa yine güvenli varsayılan: tüm bilgi

  return matched.map((c) => c.text).join("\n\n");
}

// ---------- 3. Sistem talimatı ----------
function buildSystemInstruction(context) {
  return `Sen Sakarya Üniversitesi Uluslararası Ticaret ve Lojistik (UTİC) Bölümü öğrencilerine yardımcı olan, öğrencilerin sevdiği bir yapay zeka asistanısın. Adın "UTİC AI Asistanı". Tıpkı bölümdeki işini iyi bilen, yardımsever bir abi/abla gibisin, resmi bir memur gibi değil.

KURALLAR (kesinlikle uy):
1. SADECE aşağıda "BÖLÜM BİLGİLERİ" başlığı altında verilen bilgileri kullanarak cevap ver. Kendi genel bilgini, tahminini veya dünyada var olan benzer program/topluluk/yarışma isimlerini (örneğin İşletLab gibi) KULLANMA, uydurma. Bir konu (örneğin bir topluluk, komisyon, yarışma) BÖLÜM BİLGİLERİ içinde hiç geçmiyorsa, o konu hakkında TEK KELİME bile üretme, sadece bilginin olmadığını söyle.
2. Eğer soru bu bilgiler içinde yoksa, samimi bir dille "Bu konuda elimde net bir bilgi yok, bölüm sekreterliğine sormanı öneririm 🙂" gibi bir şey söyle. Asla uydurma bilgi verme, asla dışarıdan bir isim veya detay ekleme.
3. Cevapların doğal ve akıcı olsun, gereksiz laf kalabalığı yapma ("Aşağıda bilgiler sunulmuştur" gibi resmi girişler YASAK) ama konuyu da eksik bırakma: BÖLÜM BİLGİLERİ'nde o soruyla ilgili ne kadar detay varsa, onu eksiksiz aktar. Kısa tutmak için bilgi atlama, sadece gereksiz tekrar ve resmi kalıplardan kaçın.
4. Madde madde liste, adım adım bir süreç anlatırken (örn. "staj başvurusu nasıl yapılır") kullanışlıdır. Diğer durumlarda düz, sohbet eder gibi doğal cümlelerle yaz.
5. Kullanıcı "detaylı anlat", "daha fazla bilgi ver" derse, elindeki tüm ilgili detayları kapsamlı şekilde ver.
6. TON: Samimi, sıcak, arkadaş canlısı bir üniversiteli gibi konuş. "Sen" dili kullan. Ara sıra (her cümlede değil) uygun bir emoji kullanabilirsin (😊 🎓 ✈️ 📋 gibi), ama abartma. Robotik, resmi-evrak dili KULLANMA. Yine de bilgi doğruluğundan asla ödün verme.
7. Sohbeti asla kendi kararınla bitirme; öğrenci başka soru sormak isteyebilir.
8. Cevabın kesinlikle YARIM KALMASIN, verdiğin her cümleyi tamamla, konuyu toparlayarak bitir.
9. NOKTALAMA STİLİ: Cevaplarında uzun tire (—) ve orta nokta (·) işaretlerini KULLANMA. Bunun yerine virgül, nokta veya "ve" gibi normal bağlaçlar kullan.
10. KİMLİK SORULARI: "Seni kim geliştirdi", "seni kim yaptı", "bu asistanı kim yazdı" gibi bir soru gelirse: bu asistanın İrem Demir tarafından, UTİC Bölümü öğrencileri için, 7 Temmuz 2026 tarihinde geliştirildiğini söyle. "İrem Demir kim" diye sorulursa: İrem Demir'in UTİC Bölümü öğrencisi olduğunu ve bu projeyi uçtan uca (tasarımından geliştirmesine) kendisinin hazırladığını söyle. Hangi yapay zeka modelini, hangi şirketin teknolojisini kullandığını ASLA söyleme, bu konuda soru gelirse nazikçe "bunu paylaşamıyorum" de ve konuyu İrem Demir'in geliştirdiği bir bölüm projesi olduğuna getir.

BÖLÜM BİLGİLERİ:
${context}`;
}

const PRIMARY_MODEL = "gemini-2.5-flash-lite";
const FALLBACK_MODEL = "gemini-2.5-flash"; // birincil model yoğunsa (503) buna geçilir
const geminiUrl = (model) => `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;

// ---------- 4. Zaman aşımlı Gemini çağrısı ----------
async function callGemini(body, apiKey, model, timeoutMs = 9000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${geminiUrl(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timer);
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

  const { message, history } = payload;

  if (!message || typeof message !== "string" || !message.trim()) {
    return {
      statusCode: 400,
      headers,
      body: JSON.stringify({ error: "Mesaj boş olamaz." }),
    };
  }

  const apiKey = (process.env.GEMINI_API_KEY || "").trim();
  if (!apiKey) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({
        error: "Sunucu yapılandırma hatası: GEMINI_API_KEY tanımlı değil.",
      }),
    };
  }

  const contents = [];
  if (Array.isArray(history)) {
    for (const turn of history.slice(-6)) {
      if (!turn || !turn.text) continue;
      contents.push({
        role: turn.role === "assistant" ? "model" : "user",
        parts: [{ text: String(turn.text).slice(0, 2000) }],
      });
    }
  }
  contents.push({ role: "user", parts: [{ text: message.slice(0, 2000) }] });

  const context = pickRelevantContext(message);
  const requestBody = {
    system_instruction: { parts: [{ text: buildSystemInstruction(context) }] },
    contents,
    generationConfig: {
      temperature: 0.3,
      maxOutputTokens: 1024,
    },
  };

  let response;
  let lastErr;
  const attempts = [
    { model: PRIMARY_MODEL, wait: 0 },
    { model: PRIMARY_MODEL, wait: 700 },
    { model: FALLBACK_MODEL, wait: 0 }, // birincil model 2 denemede de yoğunsa (503) yedek modele geç
  ];

  for (const { model, wait } of attempts) {
    if (wait) await new Promise((r) => setTimeout(r, wait));
    try {
      response = await callGemini(requestBody, apiKey, model);
      if (response.ok) break;
      if (response.status === 429) break; // kota bittiyse tekrar denemek kotayı daha da tüketir, direkt çık
      if (response.status === 401 || response.status === 403) break; // yetkilendirme hatasında model değiştirmenin faydası yok
      // 503 (yoğunluk) veya diğer 5xx hatalarında bir sonraki denemeye/modele geç
    } catch (err) {
      lastErr = err;
      response = null;
    }
  }

  if (!response) {
    console.error("Gemini API'ye ulaşılamadı:", lastErr);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: "Sunucu şu an yoğun ya da yavaş yanıt veriyor. Lütfen tekrar dener misin?",
      }),
    };
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    data = null;
  }

  if (!response.ok) {
    console.error("Gemini API hatası:", JSON.stringify(data));
    const isQuota = response.status === 429;
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({
        error: isQuota
          ? "Şu anda çok fazla soru soruldu, birkaç dakika sonra tekrar dener misin? 🙏"
          : "Yapay zeka servisinden yanıt alınamadı. Lütfen tekrar dene.",
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
};

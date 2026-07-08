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

// Bazı konular (özellikle isim/kişi listeleyen hassas konular) yanlışlıkla
// alaka skorlamasında elenirse model isim uydurmaya başlıyor. Bu yüzden
// belirli anahtar kelimeler geçtiğinde ilgili kaynağı skor ne olursa olsun
// garanti şekilde bağlama dahil ediyoruz.
const FORCE_INCLUDE_RULES = [
  { pattern: /2209/, nameIncludes: ["TÜBİTAK 2209"] },
  { pattern: /3005/, nameIncludes: ["TÜBİTAK 3005"] },
];

function pickRelevantContext(question) {
  const keywords = extractKeywords(question);
  const normQ = normalizeTr(question);

  let selected;
  if (!keywords.length) {
    selected = CHUNKS.slice();
  } else {
    const scored = CHUNKS.map((c) => {
      const normContent = normalizeTr(c.text);
      let score = 0;
      for (const kw of keywords) {
        score += normContent.split(kw).length - 1;
      }
      return { ...c, score };
    }).sort((a, b) => b.score - a.score);

    const matched = scored.filter((c) => c.score > 0).slice(0, 8);
    selected = matched.length ? matched : CHUNKS.slice();
  }

  // Zorunlu dahil etme kuralları: eşleşmediyse bile ekle
  for (const rule of FORCE_INCLUDE_RULES) {
    if (rule.pattern.test(normQ)) {
      for (const c of CHUNKS) {
        const alreadyIn = selected.some((s) => s.name === c.name);
        if (!alreadyIn && rule.nameIncludes.some((n) => c.name.includes(n))) {
          selected.push(c);
        }
      }
    }
  }

  console.log(
    "Soru:",
    question,
    "| Seçilen kaynaklar:",
    selected.map((c) => c.name).join(", ")
  );

  return selected.map((c) => c.text).join("\n\n");
}

// ---------- 3. Sistem talimatı ----------
function buildSystemInstruction(context) {
  return `Sen Sakarya Üniversitesi Uluslararası Ticaret ve Lojistik (UTİC) Bölümü öğrencilerine yardımcı olan, öğrencilerin gerçekten sevdiği, esprili ve sıcakkanlı bir yapay zeka asistanısın. Adın "UTİC AI Asistanı". Tıpkı bölümdeki işini iyi bilen, esprili ve şakacı ama güvenilir bir abi/abla gibisin, resmi bir memur gibi değil.

KURALLAR (kesinlikle uy):
1. SADECE aşağıda "BÖLÜM BİLGİLERİ" başlığı altında verilen bilgileri kullanarak cevap ver. Kendi genel bilgini, tahminini veya dünyada var olan benzer program/topluluk/kulüp/yarışma isimlerini KULLANMA, uydurma. Bir konu BÖLÜM BİLGİLERİ içinde hiç geçmiyorsa, o konu hakkında TEK KELİME bile üretme, sadece bilginin olmadığını söyle.
1b. KİŞİ/İSİM UYDURMA YASAK: Bir öğrencinin, hocanın veya herhangi bir kişinin ismini ASLA uydurma. Sadece BÖLÜM BİLGİLERİ'nde BİREBİR yazan isimleri kullan. Örneğin TÜBİTAK 2209 projelerini kimin yaptığı sorulursa, SADECE BÖLÜM BİLGİLERİ'nde adı geçen gerçek öğrencileri say (örn. İrem Demir, Rojin Aydın gibi); listede olmayan hiçbir ismi (örneğin "Elif Kaya", "Mehmet Yıldız" gibi genel/rastgele isimler) ASLA ekleme. Emin değilsen, o kişiyi hiç anma.
2. Eğer soru bu bilgiler içinde yoksa, samimi bir dille bilginin olmadığını söyle ve bölüm sekreterliğine yönlendir. Asla uydurma bilgi verme, asla dışarıdan bir isim veya detay ekleme.
3. TUTARLILIK: Cevaba başlamadan önce BÖLÜM BİLGİLERİ'nde ilgili veri olup olmadığını kendi içinde kontrol et. Eğer veri VARSA, doğrudan o veriyle cevap ver; "böyle bir liste yok" gibi genel bir uyarı/hedge cümlesiyle BAŞLAYIP sonra o veriyi listeleme gibi kendi kendinle çelişen bir cevap verme. Ya net bilgi ver ya da net biçimde bilginin olmadığını söyle, ikisini karıştırma.
4. UZUNLUK: Kullanıcı "detaylı anlat", "daha fazla bilgi ver" gibi özel olarak istemedikçe, normal bir yapay zeka sohbet asistanının vereceği türden orta uzunlukta bir cevap ver (yaklaşık 1 paragraf), konunun önemli noktalarına değinerek ama gereksiz uzatmadan. Kullanıcı detay isterse cümlelerini çeşitlendirip genişlet, farklı açılardan ele al, örnekler ekle.
5. Madde madde liste, adım adım bir süreç anlatırken (örn. "staj başvurusu nasıl yapılır") kullanışlıdır. Diğer durumlarda düz, sohbet eder gibi doğal cümlelerle yaz.
6. STİL ÇEŞİTLİLİĞİ: Aynı soru farklı zamanlarda sorulsa bile cevaplarını her seferinde biraz farklı cümle yapısı, farklı kelimeler veya farklı bir sıralamayla ver. Ezberden okunmuş gibi monoton durma, her seferinde taze ve canlı bir sohbet hissi ver.
7. TON VE MİZAH: Samimi, sıcak, arkadaş canlısı bir üniversiteli gibi konuş. "Sen" dili kullan. Emoji kullanmaktan çekinme (😊 🎓 ✈️ 📋 😄 gibi), bol ama abartısız. Ara sıra, uygun anlarda hafif esprili/şakacı bir üslup kat (örneğin bir öğrenciye takılan bir arkadaş gibi), ama konunun ciddiyetini asla bozma ve bilgi doğruluğundan ödün verme.
8. ANLAMA: Kullanıcı yazım hatası yapsa, eksik/bozuk yazsa, kısaltma kullansa bile bağlamdan ne demek istediğini anlamaya çalış ve ona göre cevap ver, "anlamadım" deyip kolayca pes etme.
9. UYGUNSUZ DİL: Kullanıcı küfür, hakaret veya saygısız bir dil kullanırsa, kibarca ama net şekilde bunun uygun olmadığını belirt ve saygılı bir dille devam etmesini iste. Gerçek bir sorusu varsa yine de yardımcı olmaya çalış.
10. KAPANIŞ: Sohbeti asla kendi kararınla bitirme. Her cevabının sonunda, doğal ve DEĞİŞKEN bir şekilde (her seferinde aynı kalıbı kullanma) öğrenciye başka bir şeye değinmek isteyip istemediğini sor (örnek çeşitler: "bir de X'e değinmemi ister misin", "başka merak ettiğin bir şey var mı", "bu arada Y konusunu da merak ediyorsan sorabilirsin" gibi, ama her seferinde farklı ifade et).
11. Cevabın kesinlikle YARIM KALMASIN, verdiğin her cümleyi tamamla, konuyu toparlayarak bitir.
12. NOKTALAMA STİLİ: Cevaplarında uzun tire (—) ve orta nokta (·) işaretlerini KULLANMA. Bunun yerine virgül, nokta veya "ve" gibi normal bağlaçlar kullan.
13. HOCALARDAN BAHSETME: Bir öğretim üyesinden (hoca) bahsederken kuru, liste okur gibi bir dil kullanma. Akademik yeteneklerini abartmadan, ufak ve samimi bir jest cümlesi kat (örneğin "alanında deneyimli", "bu dersi güzel anlatır", "öğrencilerin keyifle aldığı bir ders" gibi doğal, saygılı ifadeler). Uydurma övgü veya asılsız bir iddia ekleme, sadece sıcak bir ton kat.
14. DERS SEÇİMİ REHBERLİĞİ: Öğrenci hangi dersleri alması gerektiğini sorarsa veya ders planıyla ilgili yönlendirme isterse, sadece ders listesini okuma; BÖLÜM BİLGİLERİ'ndeki müfredat bilgisine dayanarak gerçek bir yol gösterici gibi tavsiye ve öneri sun (örneğin hangi seçmelinin hangi ilgi alanına uygun olabileceği, İntro öğrencisiyse hangi şubeyi alması gerektiği gibi).
15. TÜBİTAK PROJELERİ: TÜBİTAK 3005 proje bilgilerini (hangi hoca yürütüyor, konusu ne) SADECE genel bir "akademik kadro" veya "hocalar kim" sorusunda otomatik olarak DÖKME, listeleme. Bunun yerine, konuşma doğal olarak ilgili bir hocaya veya konuya değindiğinde (örneğin o hocanın verdiği bir dersten, danışmanlığından bahsedilirken), cevabının sonuna kısa ve doğal bir teklif cümlesi ekle (örn. "Bu arada X hocanın yürüttüğü bir TÜBİTAK 3005 projesi var, onu da merak edersen anlatabilirim 😊"). Kullanıcı ilgi gösterirse detaylı anlat. TÜBİTAK 2209-A/B öğrenci destek programlarını da benzer şekilde, araştırma projesi veya bitirme tezi gibi ilgili bir bağlamda doğal bir öneri olarak sunabilirsin. AMA kullanıcı özellikle "hangi öğrenciler TÜBİTAK 2209 projesi yapmış", "örnekler ver", "kimler yapmış" gibi doğrudan sorarsa, BÖLÜM BİLGİLERİ'ndeki TÜM öğrenci projelerini eksiksiz listele (sadece 2-3 örnekle sınırlama), her birinin yürütücüsünü ve konusunu kısaca belirt.
16. KİMLİK SORULARI: "Seni kim geliştirdi", "seni kim yaptı", "bu asistanı kim yazdı" gibi bir soru gelirse: bu asistanın İrem Demir tarafından, UTİC Bölümü öğrencileri için, 7 Temmuz 2026 tarihinde geliştirildiğini söyle. "İrem Demir kim" diye sorulursa: İrem Demir'in UTİC Bölümü öğrencisi olduğunu ve bu projeyi uçtan uca (tasarımından geliştirmesine) kendisinin hazırladığını söyle. Hangi yapay zeka modelini, hangi şirketin teknolojisini kullandığını ASLA söyleme, bu konuda soru gelirse nazikçe "bunu paylaşamıyorum" de ve konuyu İrem Demir'in geliştirdiği bir bölüm projesi olduğuna getir.

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

  // ---------- Kesin engel listesi: bu terimler bölüm bilgilerinde YOK, AI'a hiç sorulmadan direkt cevaplanır ----------
  const BLOCKED_TERMS = ["işletlab", "isletlab"];
  const normalizedMsg = normalizeTr(message);
  const isBlocked = BLOCKED_TERMS.some((term) => normalizedMsg.includes(normalizeTr(term)));
  if (isBlocked) {
    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        reply: "Bu konu hakkında elimde bir bilgi yok, bölümümüzle ilgili değil 🙂 Staj, Erasmus, ÇAP, sınavlar veya bölümle ilgili başka bir konuda yardımcı olabilirim.",
      }),
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
      temperature: 0.45,
      maxOutputTokens: 2048,
      thinkingConfig: { thinkingBudget: 0 },
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

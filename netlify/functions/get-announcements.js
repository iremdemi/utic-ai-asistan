// UTİC AI Asistanı — Bölüm Duyuruları Fonksiyonu
// Bölümün resmi web sitesindeki duyuru listesini CANLI olarak çeker.
// Hiçbir şey elle güncellenmez; site nasılsa panelde de öyle görünür.

const SOURCE_URL = "https://utic.sakarya.edu.tr/tr/duyuru/goruntule/liste";

function decodeHtmlEntities(str) {
  return str
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&ouml;/gi, "ö")
    .replace(/&uuml;/gi, "ü")
    .replace(/&ccedil;/gi, "ç")
    .replace(/&scedil;/gi, "ş")
    .replace(/&Ouml;/g, "Ö")
    .replace(/&Uuml;/g, "Ü")
    .replace(/&Ccedil;/g, "Ç")
    .replace(/&Scedil;/g, "Ş")
    .replace(/&nbsp;/g, " ");
}

function parseAnnouncements(html) {
  const results = [];
  const seenIds = new Set();

  // Her duyurunun görsel+link bloğunu bul: href="...duyuru/goster/ID/slug" ... alt="Başlık"
  const blockRegex =
    /href="(https:\/\/utic\.sakarya\.edu\.tr\/tr\/duyuru\/goster\/(\d+)\/[a-z0-9-]+)"[^>]*>\s*<img[^>]*alt="([^"]*)"/gi;

  let match;
  while ((match = blockRegex.exec(html)) !== null) {
    const [, url, id, title] = match;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    results.push({ id, url, title: decodeHtmlEntities(title.trim()) });
  }

  // Her duyuru için tarih ve kısa açıklamayı, o duyurunun HTML bloğu içinden yakalamaya çalış
  for (const item of results) {
    const startIdx = html.indexOf(`goster/${item.id}/`);
    if (startIdx === -1) continue;
    const chunk = html.slice(startIdx, startIdx + 2000);

    const dateMatch = chunk.match(
      /(\d{1,2}\s+(Ocak|Şubat|Mart|Nisan|Mayıs|Haziran|Temmuz|Ağustos|Eylül|Ekim|Kasım|Aralık)\s+\d{4})/
    );
    item.date = dateMatch ? dateMatch[1] : "";

    // Başlığın geçtiği ikinci konumdan sonraki düz metni özet olarak almayı dene
    const afterTitleIdx = chunk.indexOf(item.title, chunk.indexOf(item.title) + item.title.length);
    const searchFrom = afterTitleIdx !== -1 ? chunk.slice(afterTitleIdx) : chunk;
    const descMatch = searchFrom.match(/>([^<>]{30,280})</);
    item.excerpt = descMatch ? decodeHtmlEntities(descMatch[1].trim()) : "";
  }

  return results;
}

exports.handler = async function (event) {
  const headers = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
  };

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" };
  }

  try {
    const response = await fetch(SOURCE_URL, {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; TicoBot/1.0; +https://utic.info)" },
    });

    if (!response.ok) {
      throw new Error("source_fetch_failed_" + response.status);
    }

    const html = await response.text();
    const announcements = parseAnnouncements(html).slice(0, 8);

    return {
      statusCode: 200,
      headers: { ...headers, "Content-Type": "application/json", "Cache-Control": "public, max-age=900" },
      body: JSON.stringify({ announcements }),
    };
  } catch (err) {
    console.error("Duyuru çekme hatası:", err);
    return {
      statusCode: 502,
      headers,
      body: JSON.stringify({ error: "Duyurular şu anda alınamadı, lütfen daha sonra tekrar dene." }),
    };
  }
};

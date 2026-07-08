UTİC AI Asistanı — Kurulum Rehberi

Bu proje 3 parçadan oluşur:


index.html → Öğrencinin gördüğü sohbet ekranı
netlify/functions/chat.js → Arka planda Gemini API'yi çağıran gizli fonksiyon
netlify/functions/knowledge.js → Bölüm belgelerinden çıkarılan bilgi bankası


1. GitHub'a yükle


utic-ai-asistan reponu aç.
"Add file → Upload files" ile bu klasördeki tüm dosyaları (alt klasörler dahil) sürükle-bırak yap.
"Commit changes" de.


2. Netlify'a bağla


Netlify panelinde "Add new site" → "Import an existing project".
GitHub'ı seç, utic-ai-asistan reponu bul ve seç.
Build ayarlarına dokunma (zaten netlify.toml içinde tanımlı), Deploy de.
1-2 dakika içinde rastgele-isim.netlify.app adresinde canlı olacak.


3. Gemini API anahtarını ekle (ÇOK ÖNEMLİ)

Anahtarı asla kod içine yazma — Netlify'ın "Environment variables" kısmına ekle:


Site paneli → Site configuration → Environment variables.
Add a variable:

Key: GEMINI_API_KEY
Value: (Google AI Studio'dan aldığın AIza... ile başlayan kod)



Kaydet, sonra Deploys → Trigger deploy → Deploy site ile siteyi yeniden yayınla (env değişkeni ancak yeniden deploy sonrası aktif olur).


4. Test et

Netlify'ın verdiği .netlify.app adresine git, birkaç soru sor:


"Staj süreci nasıl işliyor?"
"Erasmus için hangi belgeler gerekiyor?"
"Bölüm başkanı kim?"


5. utic.info domainini bağla


Site paneli → Domain management → Add a domain → utic.info yaz.
Netlify sana DNS kayıtları verecek (genelde bir A record + www için CNAME).
Domainini aldığın panelde (Porkbun vs.) DNS ayarlarına bu kayıtları ekle.
DNS yayılması birkaç dakika – birkaç saat sürebilir. Netlify otomatik ücretsiz SSL (https) kurar.


Bilgi bankasını güncellemek istersen

netlify/functions/knowledge.js dosyasını aç, içindeki metni düzenle, GitHub'a tekrar yükle — Netlify otomatik yeniden yayınlar. Yeni bir Word belgesi eklemek istersen bana gönder, güncel dosyayı ben hazırlarım.

Maliyet

Tamamen ücretsiz: Netlify ücretsiz plan (ayda 125.000 fonksiyon çağrısı) + Gemini API ücretsiz katman (gemini-2.5-flash: günde 250 istek, dakikada 10 istek). Bir bölüm chatbot'u için fazlasıyla yeterli. Trafik artarsa Gemini tarafında gemini-2.5-flash-lite modeline geçilerek günlük 1000 isteğe çıkılabilir (chat.js içinde MODEL değişkenini değiştirmen yeterli).

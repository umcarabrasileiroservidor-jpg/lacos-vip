// Prepara as fotos enviadas pelo painel: guarda o ORIGINAL intacto e gera versões leves
// (400, 800 e 1600 px em WebP, e um JPG para pré-visualização de links no WhatsApp).
const TAMANHOS = [400, 800, 1600];
const LIMITE_MB = 25;

function novoId(prefixo = 'f') {
  const a = new Uint8Array(4); crypto.getRandomValues(a);
  return `${prefixo}${Date.now().toString(36)}-${[...a].map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function canvasPara(bitmap, maximo) {
  const escala = Math.min(1, maximo / Math.max(bitmap.width, bitmap.height));
  const w = Math.max(1, Math.round(bitmap.width * escala)), h = Math.max(1, Math.round(bitmap.height * escala));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h); // fotos PNG com transparência ficam com fundo branco
  ctx.imageSmoothingQuality = 'high';
  // redução em etapas para manter a nitidez
  let origem = bitmap, ow = bitmap.width, oh = bitmap.height;
  while (ow / 2 > w) {
    const t = document.createElement('canvas'); t.width = Math.round(ow / 2); t.height = Math.round(oh / 2);
    const tc = t.getContext('2d'); tc.imageSmoothingQuality = 'high'; tc.drawImage(origem, 0, 0, t.width, t.height);
    origem = t; ow = t.width; oh = t.height;
  }
  ctx.drawImage(origem, 0, 0, w, h);
  return c;
}
const paraBlob = (c, tipo, q) => new Promise((ok) => c.toBlob(ok, tipo, q));

export async function processarFoto(arquivo) {
  if (!arquivo.type.startsWith('image/')) throw new Error(`“${arquivo.name}” não é uma imagem.`);
  if (arquivo.size > LIMITE_MB * 1024 * 1024) throw new Error(`“${arquivo.name}” tem mais de ${LIMITE_MB} MB.`);
  let bitmap;
  try { bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); }
  catch { throw new Error(`Não consegui abrir “${arquivo.name}”. Envie a foto em JPG ou PNG (no iPhone: Ajustes › Câmera › Formatos › Mais Compatível).`); }
  const id = novoId();
  const extOrig = (arquivo.name.split('.').pop() || 'jpg').toLowerCase().replace('jpeg', 'jpg').replace(/[^a-z0-9]/g, '') || 'jpg';
  const arquivos = [{ caminho: `originais/${id}.${extOrig}`, blob: arquivo }];
  let ext = 'webp';
  for (const t of TAMANHOS) {
    const c = canvasPara(bitmap, t);
    let b = await paraBlob(c, 'image/webp', t === 1600 ? 0.84 : 0.8);
    if (!b || b.type !== 'image/webp') { ext = 'jpg'; b = await paraBlob(c, 'image/jpeg', 0.86); }
    arquivos.push({ caminho: `fotos/${id}-${t}.${ext}`, blob: b, tamanho: t });
    if (t === 800) arquivos.push({ caminho: `fotos/${id}-og.jpg`, blob: await paraBlob(c, 'image/jpeg', 0.8) });
  }
  // se a versão WebP saiu em JPG, os nomes precisam bater com a extensão
  const foto = { id, w: bitmap.width, h: bitmap.height, ext, original: `${id}.${extOrig}` };
  bitmap.close?.();
  return { foto, arquivos };
}

export async function processarAudio(arquivo) {
  if (!/^audio\//.test(arquivo.type)) throw new Error('Envie um arquivo de áudio (MP3, M4A ou OGG).');
  if (arquivo.size > 8 * 1024 * 1024) throw new Error('O áudio precisa ter no máximo 8 MB.');
  const ext = (arquivo.name.split('.').pop() || 'mp3').toLowerCase().replace(/[^a-z0-9]/g, '');
  const nome = `${novoId('a')}.${ext}`;
  return { nome, arquivos: [{ caminho: `audio/${nome}`, blob: arquivo }] };
}

// Gera o site estático em ./dist a partir de data/catalogo.json.
// Uso: node scripts/build.mjs [--base /caminho/] [--url https://endereco-do-site]
// Não precisa instalar nada além do Node.js.
import { readFile, writeFile, mkdir, cp, rm, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { esc, campanhasAtivas, produtoVisivel, dadosPublicos, precoUnidade, dinheiro, hojeBR } from '../site/js/nucleo.js';
import { renderFaixa, renderHero, renderSecoes, renderProduto, renderRodape } from '../site/js/paginas.js';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const arg = (n, padrao) => { const i = process.argv.indexOf(n); return i > -1 ? process.argv[i + 1] : padrao; };
let BASE = arg('--base', process.env.SITE_BASE || '/');
if (!BASE.endsWith('/')) BASE += '/';
const URL_SITE = (arg('--url', process.env.SITE_URL || '') || '').replace(/\/$/, '');

const dados = JSON.parse(await readFile(path.join(RAIZ, 'data/catalogo.json'), 'utf8'));
const hoje = hojeBR();
const ativas = campanhasAtivas(dados, hoje);
const ctx = { base: BASE, categorias: dados.categorias, ativas };
const publico = dadosPublicos(dados);

await rm(DIST, { recursive: true, force: true });
await mkdir(DIST, { recursive: true });
for (const d of ['css', 'js', 'img', 'fonts', 'audio', 'painel']) {
  await cp(path.join(RAIZ, 'site', d), path.join(DIST, d), { recursive: true }).catch(() => {});
}
await cp(path.join(RAIZ, 'fotos'), path.join(DIST, 'fotos'), { recursive: true });
await cp(path.join(RAIZ, 'audio'), path.join(DIST, 'audio-loja'), { recursive: true }).catch(() => {});

// Versão dos arquivos (evita que o celular do cliente use CSS/JS antigos)
const hashDe = async (f) => createHash('sha1').update(await readFile(path.join(DIST, f))).digest('hex').slice(0, 8);
const V = {};
for (const f of ['css/loja.css', 'js/loja.js', 'js/nucleo.js', 'js/paginas.js', 'js/musica.js', 'js/efeitos.js']) V[f] = await hashDe(f);
const dadosJson = JSON.stringify(publico);
await writeFile(path.join(DIST, 'dados.json'), dadosJson);

const sprite = await readFile(path.join(RAIZ, 'site/img/icones.svg'), 'utf8');
const temaBuild = ativas[0] && ativas[0].tema !== 'padrao' ? ativas[0].tema : '';

function pagina({ titulo, descricao, canonico, imagem, corpo, extraHead = '', classe = '' }) {
  const l = dados.loja;
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(titulo)}</title>
<meta name="description" content="${esc(descricao)}">
<meta name="theme-color" content="#861D47">
<meta name="base-site" content="${BASE}">
${canonico && URL_SITE ? `<link rel="canonical" href="${esc(canonico)}">` : ''}
<meta property="og:type" content="website">
<meta property="og:locale" content="pt_BR">
<meta property="og:site_name" content="${esc(l.nome)}">
<meta property="og:title" content="${esc(titulo)}">
<meta property="og:description" content="${esc(descricao)}">
${imagem ? `<meta property="og:image" content="${esc(imagem)}">` : ''}
${canonico && URL_SITE ? `<meta property="og:url" content="${esc(canonico)}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${BASE}img/icone-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="${BASE}img/icone-180.png">
<link rel="manifest" href="${BASE}manifest.webmanifest">
<link rel="preload" href="${BASE}fonts/montserrat-latin-500-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${BASE}fonts/montserrat-latin-700-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${BASE}css/loja.css?v=${V['css/loja.css']}">
${extraHead}
<script type="module" src="${BASE}js/loja.js?v=${V['js/loja.js']}"></script>
</head>
<body class="${classe}${temaBuild ? ` tema-${temaBuild}` : ''}" data-montado="${ativas.map((c) => c.id).join(',')}">
${sprite}
<a class="pular" href="#conteudo">Pular para o conteúdo</a>
<div class="faixa" data-faixa>${renderFaixa(dados, ativas)}</div>
<header class="topo">
  <div class="topo-in">
    <a class="marca" href="${BASE}" aria-label="${esc(l.nome)} — início">
      <img src="${BASE}img/laco-sm.png" alt="" width="60" height="48">
      <span class="marca-texto"><span class="marca-nome">${esc(l.nome)}</span><span class="marca-sub">Acessórios femininos</span></span>
    </a>
    <form class="busca" role="search" data-busca action="${BASE}#produtos">
      <label class="sr" for="campo-busca">Buscar produto</label>
      <svg class="i" aria-hidden="true"><use href="#i-busca"></use></svg>
      <input id="campo-busca" type="search" name="q" placeholder="Buscar laços, tiaras, kits…" autocomplete="off" enterkeyhint="search">
      <div class="busca-sugestoes" data-sugestoes hidden></div>
    </form>
    <nav class="topo-acoes" aria-label="Atalhos">
      <button type="button" class="btn-icone" data-abrir="favoritos" aria-label="Favoritos"><svg class="i" aria-hidden="true"><use href="#i-coracao"></use></svg><b class="bolha" data-n-fav hidden>0</b></button>
      <button type="button" class="btn-sacola" data-abrir="carrinho" aria-label="Abrir pedido"><svg class="i" aria-hidden="true"><use href="#i-sacola"></use></svg><span>Pedido</span><b data-n-carrinho>0</b></button>
    </nav>
  </div>
</header>
<main id="conteudo">
${corpo}
</main>
<footer class="rodape">${renderRodape(dados, BASE)}</footer>
<div class="barra-pedido" data-barra-pedido hidden>
  <button type="button" data-abrir="carrinho"><span><b data-barra-qtd>0</b> itens · <strong data-barra-total>R$ 0,00</strong></span><span class="barra-cta">Ver pedido <svg class="i" aria-hidden="true"><use href="#i-dir"></use></svg></span></button>
</div>
<aside class="gaveta" id="carrinho" data-gaveta="carrinho" aria-label="Seu pedido" hidden>
  <div class="gaveta-fundo" data-fechar></div>
  <div class="gaveta-painel" role="dialog" aria-modal="true" aria-labelledby="titulo-carrinho">
    <div class="gaveta-topo"><h2 id="titulo-carrinho">Seu pedido</h2><button type="button" class="btn-icone" data-fechar aria-label="Fechar"><svg class="i" aria-hidden="true"><use href="#i-x"></use></svg></button></div>
    <div class="gaveta-corpo" data-itens></div>
    <div class="gaveta-rodape" data-resumo></div>
  </div>
</aside>
<aside class="gaveta" id="favoritos" data-gaveta="favoritos" aria-label="Favoritos" hidden>
  <div class="gaveta-fundo" data-fechar></div>
  <div class="gaveta-painel" role="dialog" aria-modal="true" aria-labelledby="titulo-fav">
    <div class="gaveta-topo"><h2 id="titulo-fav">Favoritos</h2><button type="button" class="btn-icone" data-fechar aria-label="Fechar"><svg class="i" aria-hidden="true"><use href="#i-x"></use></svg></button></div>
    <div class="gaveta-corpo" data-favs></div>
  </div>
</aside>
<div class="zoom" data-zoom-tela hidden role="dialog" aria-modal="true" aria-label="Foto ampliada">
  <button type="button" class="btn-icone zoom-fechar" data-zoom-fechar aria-label="Fechar"><svg class="i" aria-hidden="true"><use href="#i-x"></use></svg></button>
  <button type="button" class="btn-circ zoom-ant" data-zoom-passo="-1" aria-label="Foto anterior"><svg class="i" aria-hidden="true"><use href="#i-esq"></use></svg></button>
  <div class="zoom-palco" data-zoom-palco></div>
  <button type="button" class="btn-circ zoom-prox" data-zoom-passo="1" aria-label="Próxima foto"><svg class="i" aria-hidden="true"><use href="#i-dir"></use></svg></button>
  <p class="zoom-info" data-zoom-info></p>
</div>
<div class="aviso-flutuante" data-aviso role="status" aria-live="polite"></div>
<div class="musica" data-musica hidden></div>
<canvas class="efeitos" data-efeitos aria-hidden="true"></canvas>
<script type="application/json" id="dados">${dadosJson.replace(/</g, '\\u003c')}</script>
</body>
</html>`;
}

const capaLoja = URL_SITE ? `${URL_SITE}/img/compartilhar.jpg` : `${BASE}img/compartilhar.jpg`;
const fotoAbs = (f) => (URL_SITE ? `${URL_SITE}/fotos/${f.id}-og.jpg` : `${BASE}fotos/${f.id}-og.jpg`);

// Página inicial
const l = dados.loja;
const jsonLdLoja = { '@context': 'https://schema.org', '@type': 'Store', name: l.nome, description: l.descricao, telephone: `+${l.whatsapp}`, ...(URL_SITE ? { url: URL_SITE + '/' , image: capaLoja } : {}), ...(l.instagram ? { sameAs: [`https://instagram.com/${l.instagram.replace(/^@/, '')}`] } : {}) };
await writeFile(path.join(DIST, 'index.html'), pagina({
  titulo: `${l.nome} — ${l.slogan}`,
  descricao: l.descricao,
  canonico: URL_SITE ? URL_SITE + '/' : '',
  imagem: capaLoja,
  classe: 'pg-inicio',
  extraHead: `<script type="application/ld+json">${JSON.stringify(jsonLdLoja)}</script>`,
  corpo: `<div data-hero>${renderHero(dados, ctx)}</div>\n<div data-secoes>${renderSecoes(dados, ctx)}</div>`,
}));

// Páginas de produto (inclusive os "somente na campanha", para links compartilhados continuarem funcionando)
let nProdutos = 0;
for (const p of dados.produtos.filter((x) => x.visivel)) {
  const dir = path.join(DIST, 'produto', p.slug);
  await mkdir(dir, { recursive: true });
  const canon = URL_SITE ? `${URL_SITE}/produto/${p.slug}/` : '';
  const ld = { '@context': 'https://schema.org', '@type': 'Product', name: p.nome, sku: p.ref, ...(p.descricao ? { description: p.descricao } : {}), image: p.fotos.map(fotoAbs), category: dados.categorias.find((c) => c.id === p.categoria)?.nome, offers: { '@type': 'Offer', priceCurrency: 'BRL', price: p.preco.toFixed(2), availability: p.esgotado ? 'https://schema.org/OutOfStock' : 'https://schema.org/InStock', ...(canon ? { url: canon } : {}) } };
  await writeFile(path.join(dir, 'index.html'), pagina({
    titulo: `${p.nome} — ${dinheiro(p.preco)} ${precoUnidade(p)} | ${l.nome}`,
    descricao: p.descricao || `${p.nome} por ${dinheiro(p.preco)} ${precoUnidade(p)}. ${l.descricao}`,
    canonico: canon,
    imagem: p.fotos[0] ? fotoAbs(p.fotos[0]) : capaLoja,
    classe: 'pg-produto',
    extraHead: `<script type="application/ld+json">${JSON.stringify(ld).replace(/</g, '\\u003c')}</script>`,
    corpo: `<div class="pagina-produto">${renderProduto(p, dados, { ...ctx, ativas })}</div>`,
  }));
  nProdutos++;
}

// 404, manifest, robots, sitemap
await writeFile(path.join(DIST, '404.html'), pagina({ titulo: `Página não encontrada | ${l.nome}`, descricao: l.descricao, corpo: `<section class="secao vazio-pagina"><h1>Ops! Página não encontrada.</h1><p>O produto pode ter saído do catálogo.</p><a class="btn btn-primario" href="${BASE}">Ver catálogo</a></section>` }));
await writeFile(path.join(DIST, 'manifest.webmanifest'), JSON.stringify({ name: l.nome, short_name: l.nome, start_url: BASE, display: 'standalone', background_color: '#FBF8F4', theme_color: '#861D47', lang: 'pt-BR', icons: [192, 512].map((n) => ({ src: `${BASE}img/icone-${n}.png`, sizes: `${n}x${n}`, type: 'image/png' })) }));
await writeFile(path.join(DIST, 'robots.txt'), `User-agent: *\nDisallow: ${BASE}painel/\n${URL_SITE ? `Sitemap: ${URL_SITE}/sitemap.xml\n` : ''}`);
if (URL_SITE) {
  const urls = [`${URL_SITE}/`, ...dados.produtos.filter((p) => produtoVisivel(p, ativas)).map((p) => `${URL_SITE}/produto/${p.slug}/`)];
  await writeFile(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u)}</loc></url>`).join('\n')}\n</urlset>\n`);
}
await writeFile(path.join(DIST, '.nojekyll'), '');

console.log(`Site gerado em dist/ — ${nProdutos} páginas de produto, campanha no ar: ${ativas.map((c) => c.nome).join(', ') || 'nenhuma'} (hoje ${hoje}), base ${BASE}`);

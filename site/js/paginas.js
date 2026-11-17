// Montagem das seções das páginas. Usado pelo gerador (HTML pronto para o Google)
// e pelo navegador (para aplicar campanhas conforme a data, sem precisar republicar).
import {
  esc, dinheiro, icone, cartaoProduto, produtoVisivel, produtosDaSecao, produtosDaCampanha,
  ordenarDisponiveis, urlFoto, srcsetFoto, urlProduto, precoUnidade, linkWhats,
} from './nucleo.js';

const decoracao = {
  natal: `<svg class="deco deco-natal" viewBox="0 0 400 120" aria-hidden="true">
    <path d="M0 18 Q100 70 200 18 T400 18" class="fio"/>
    <g class="bolas">
      <g transform="translate(52 44)"><line y1="-12" y2="0"/><circle r="11" class="b1"/><rect x="-4" y="-15" width="8" height="5" rx="1"/></g>
      <g transform="translate(150 50)"><line y1="-14" y2="0"/><circle r="13" class="b2"/><rect x="-4" y="-17" width="8" height="5" rx="1"/></g>
      <g transform="translate(250 50)"><line y1="-14" y2="0"/><circle r="12" class="b3"/><rect x="-4" y="-16" width="8" height="5" rx="1"/></g>
      <g transform="translate(348 44)"><line y1="-12" y2="0"/><circle r="10" class="b1"/><rect x="-4" y="-14" width="8" height="5" rx="1"/></g>
    </g>
  </svg>`,
  reveillon: `<svg class="deco deco-reveillon" viewBox="0 0 400 120" aria-hidden="true">
    <g class="estrelas">
      <path d="M60 30 l4 12 12 4 -12 4 -4 12 -4 -12 -12 -4 12 -4z"/>
      <path d="M340 24 l3 9 9 3 -9 3 -3 9 -3 -9 -9 -3 9 -3z"/>
      <path d="M300 80 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/>
      <path d="M110 86 l2 6 6 2 -6 2 -2 6 -2 -6 -6 -2 6 -2z"/>
    </g>
  </svg>`,
};

export function renderFaixa(dados, ativas) {
  const c = ativas[0];
  const loja = dados.loja;
  if (c && c.faixaTopo) return `<span>${esc(c.faixaTopo)}</span>`;
  const partes = [];
  if (loja.faixaTopo) partes.push(`<span${loja.pedidoMinimo ? ' class="extra"' : ''}>${esc(loja.faixaTopo)}</span>`);
  if (loja.pedidoMinimo) partes.push(`<span>Atacado • Pedido mínimo ${dinheiro(loja.pedidoMinimo)}</span>`);
  return partes.join('<span class="sep">•</span>');
}

export function renderHero(dados, ctx) {
  const { base, ativas } = ctx;
  const c = ativas[0];
  if (c && c.tema !== 'padrao') {
    const b = c.banner || {};
    return `<section class="hero hero-campanha hero-${esc(c.tema)}" aria-label="${esc(c.titulo)}">
  ${decoracao[c.tema] || ''}
  <div class="hero-texto">
    <p class="sobretitulo">${esc(c.nome)}</p>
    <h2>${esc(b.titulo || c.titulo)}</h2>
    ${b.texto ? `<p>${esc(b.texto)}</p>` : ''}
    <a class="btn btn-tema" href="#campanha">${esc(b.botao || 'Ver coleção')}</a>
    ${c.tema === 'reveillon' ? '<p class="contagem" data-contagem aria-live="off"></p>' : ''}
  </div>
  ${b.imagem ? `<div class="hero-imagem"><img src="${urlFoto(base, b.imagem, 1600)}" srcset="${srcsetFoto(base, b.imagem)}" sizes="(min-width: 900px) 50vw, 100vw" alt="" fetchpriority="high"></div>` : renderMosaico(dados, ctx, produtosDaCampanha(dados, c))}
</section>`;
  }
  const h = dados.inicio.hero;
  if (!h || !h.ativo) return '';
  return `<section class="hero" aria-label="Apresentação">
  <div class="hero-texto">
    ${h.selo ? `<p class="sobretitulo">${esc(h.selo)}</p>` : ''}
    <h2>${formatarTitulo(h.titulo)}</h2>
    ${h.texto ? `<p>${esc(h.texto)}</p>` : ''}
    <div class="hero-botoes">
      <a class="btn btn-primario" href="#produtos">${esc(h.botao || 'Ver produtos')}</a>
      <a class="btn btn-whats" href="${linkWhats(dados.loja.whatsapp, 'Olá! Vim pelo catálogo Laços VIP.')}" target="_blank" rel="noopener">${icone('whats')}<span>Falar no WhatsApp</span></a>
    </div>
    ${dados.loja.pedidoMinimo ? `<p class="hero-nota">${icone('info')}<span>Atacado: pedido mínimo de <strong>${dinheiro(dados.loja.pedidoMinimo)}</strong></span></p>` : ''}
  </div>
  ${renderMosaico(dados, ctx, null)}
</section>`;
}

function formatarTitulo(t) {
  // "Pequenos detalhes. Grandes encantos." -> segunda frase em itálico elegante
  const partes = String(t || '').split(/(?<=\.)\s+/);
  if (partes.length < 2) return esc(t);
  return `${esc(partes[0])} <em>${esc(partes.slice(1).join(' '))}</em>`;
}

/** Mosaico de 3 fotos reais de produtos (escolhidas no painel, ou destaques/novidades). */
function renderMosaico(dados, ctx, preferidos) {
  const { base, ativas } = ctx;
  let fotos = [];
  const escolhidas = dados.inicio.hero?.imagens || [];
  if (!preferidos && escolhidas.length) fotos = escolhidas;
  else {
    const lista = preferidos && preferidos.length ? preferidos : [
      ...produtosDaSecao(dados, dados.inicio.secoes.find((s) => s.tipo === 'destaques') || {}, ativas),
      ...produtosDaSecao(dados, dados.inicio.secoes.find((s) => s.tipo === 'novidades') || {}, ativas),
      ...dados.produtos.filter((p) => produtoVisivel(p, ativas) && !p.esgotado && p.fotos[0] && Math.max(p.fotos[0].w, p.fotos[0].h) >= 800),
    ];
    const vistos = new Set();
    for (const p of lista) {
      if (p.fotos[0] && !vistos.has(p.id)) { vistos.add(p.id); fotos.push(p.fotos[0]); }
      if (fotos.length === 3) break;
    }
  }
  if (!fotos.length) return '';
  return `<div class="mosaico m${fotos.length}" aria-hidden="true">${fotos.slice(0, 3).map((f, i) =>
    `<img src="${urlFoto(base, f, 800)}" srcset="${srcsetFoto(base, f)}" sizes="(min-width: 900px) 22vw, 40vw" width="${f.w}" height="${f.h}" alt="" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}>`).join('')}</div>`;
}

function cabecalhoSecao(titulo, sobre, extra = '') {
  return `<div class="secao-topo"><div>${sobre ? `<p class="sobretitulo">${esc(sobre)}</p>` : ''}<h2>${esc(titulo)}</h2></div>${extra}</div>`;
}

function carrossel(produtos, ctx, rotulo) {
  return `<div class="carrossel" role="list" aria-label="${esc(rotulo)}">${produtos.map((p, i) => `<div role="listitem">${cartaoProduto(p, { ...ctx, eager: i < 2 && ctx.eager })}</div>`).join('')}</div>
  <div class="carrossel-nav"><button type="button" class="btn-circ" data-rolar="-1" aria-label="Anteriores">${icone('esq')}</button><button type="button" class="btn-circ" data-rolar="1" aria-label="Próximos">${icone('dir')}</button></div>`;
}

export function renderSecoes(dados, ctx) {
  const { ativas } = ctx;
  const html = [];
  for (const s of dados.inicio.secoes) {
    if (!s.ativo) continue;
    if (s.tipo === 'campanha') {
      for (const c of ativas) {
        const lista = produtosDaCampanha(dados, c);
        if (!lista.length) continue;
        html.push(`<section class="secao secao-campanha tema-${esc(c.tema)}" id="campanha" data-campanha="${esc(c.id)}">
  ${cabecalhoSecao(c.titulo || c.nome, c.subtitulo, `<span class="contador">${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}</span>`)}
  <div class="grade grade-campanha">${lista.map((p) => cartaoProduto(p, ctx)).join('')}</div>
</section>`);
      }
    } else if (s.tipo === 'banners') {
      const bs = (dados.inicio.banners || []).filter((b) => b.ativo && b.imagem);
      if (!bs.length) continue;
      html.push(`<section class="secao secao-banners" aria-label="Destaques da loja"><div class="banners">${bs.map((b, i) => {
        const externo = /^https?:/.test(b.link || '');
        return `<a class="banner" href="${esc(b.link || '#produtos')}"${externo ? ' target="_blank" rel="noopener"' : ''}>
        <img src="${urlFoto(ctx.base, b.imagem, 1600)}" srcset="${srcsetFoto(ctx.base, b.imagem)}" sizes="(min-width: 1200px) 1168px, 100vw" width="${b.imagem.w}" height="${b.imagem.h}" alt="${esc(b.titulo || '')}" ${i ? 'loading="lazy"' : ''}>
        ${b.titulo || b.texto || b.botao ? `<span class="banner-texto">${b.titulo ? `<strong>${esc(b.titulo)}</strong>` : ''}${b.texto ? `<span>${esc(b.texto)}</span>` : ''}${b.botao ? `<span class="btn btn-primario">${esc(b.botao)}</span>` : ''}</span>` : ''}
      </a>`;
      }).join('')}</div></section>`);
    } else if (s.tipo === 'novidades' || s.tipo === 'destaques') {
      const lista = produtosDaSecao(dados, s, ativas);
      if (!lista.length) continue;
      html.push(`<section class="secao secao-${s.tipo}" id="${s.tipo}">
  ${cabecalhoSecao(s.titulo, s.subtitulo)}
  ${carrossel(lista, { ...ctx, eager: s.tipo === 'novidades' }, s.titulo)}
</section>`);
    } else if (s.tipo === 'categorias') {
      const cats = dados.categorias.filter((c) => c.visivel).map((c) => {
        const ps = dados.produtos.filter((p) => p.categoria === c.id && produtoVisivel(p, ativas));
        const capa = (ps.find((p) => p.fotos[0] && Math.max(p.fotos[0].w, p.fotos[0].h) >= 800) || ps[0])?.fotos[0];
        return { c, n: ps.length, capa };
      }).filter((x) => x.n);
      if (!cats.length) continue;
      html.push(`<section class="secao secao-categorias" id="categorias">
  ${cabecalhoSecao(s.titulo, s.subtitulo)}
  <div class="cats">${cats.map(({ c, n, capa }) => `<a class="cat" href="#produtos" data-ir-categoria="${esc(c.id)}">
    ${capa ? `<img src="${urlFoto(ctx.base, capa, 400)}" alt="" loading="lazy" width="${capa.w}" height="${capa.h}">` : `<span class="sem-foto">${icone('laco')}</span>`}
    <span class="cat-nome">${esc(c.nome)}</span><span class="cat-n">${n} ${n === 1 ? 'produto' : 'produtos'}</span></a>`).join('')}</div>
</section>`);
    } else if (s.tipo === 'todos') {
      html.push(renderTodos(dados, ctx, s));
    } else if (s.tipo === 'comoComprar') {
      html.push(renderComoComprar(dados, s));
    }
  }
  return html.join('\n');
}

export function renderTodos(dados, ctx, s) {
  const { ativas } = ctx;
  const lista = ordenarDisponiveis(dados.produtos.filter((p) => produtoVisivel(p, ativas)));
  const cats = dados.categorias.filter((c) => c.visivel && lista.some((p) => p.categoria === c.id));
  return `<section class="secao secao-todos" id="produtos">
  ${cabecalhoSecao(s.titulo || 'Todos os produtos', s.subtitulo, `<span class="contador" data-contador>${lista.length} produtos</span>`)}
  <div class="filtros">
    <div class="chips" role="group" aria-label="Filtrar por categoria">
      <button type="button" class="chip on" data-cat="" aria-pressed="true">Todos</button>
      ${cats.map((c) => `<button type="button" class="chip" data-cat="${esc(c.id)}" aria-pressed="false">${esc(c.nome)}</button>`).join('')}
    </div>
    <label class="ordenar"><span class="sr">Ordenar</span>
      <select data-ordem>
        <option value="">Ordem da loja</option>
        <option value="menor">Menor preço</option>
        <option value="maior">Maior preço</option>
        <option value="az">Nome (A–Z)</option>
      </select>
    </label>
  </div>
  <div class="grade" data-grade>${lista.map((p) => cartaoProduto(p, ctx)).join('')}</div>
  <p class="vazio" data-vazio hidden>Nenhum produto encontrado. <button type="button" class="link" data-limpar>Ver todos</button></p>
</section>`;
}

function renderComoComprar(dados, s) {
  const min = dados.loja.pedidoMinimo;
  return `<section class="secao secao-como" id="como-comprar">
  ${cabecalhoSecao(s.titulo || 'Como comprar', s.subtitulo)}
  <ol class="passos">
    <li><span class="passo-n">1</span><div><h3>Escolha os produtos</h3><p>Toque em <strong>Adicionar</strong> e ajuste as quantidades no carrinho.</p></div></li>
    <li><span class="passo-n">2</span><div><h3>Envie pelo WhatsApp</h3><p>O pedido vai prontinho, com itens, códigos (REF) e total${min ? `. Pedido mínimo de <strong>${dinheiro(min)}</strong>` : ''}.</p></div></li>
    <li><span class="passo-n">3</span><div><h3>Confirmamos com você</h3><p>Combinamos pagamento, entrega e tiramos todas as suas dúvidas na conversa.</p></div></li>
  </ol>
</section>`;
}

/** Página de um produto. */
export function renderProduto(p, dados, ctx) {
  const { base, ativas } = ctx;
  const cat = dados.categorias.find((c) => c.id === p.categoria);
  const fotos = p.fotos;
  const relacionados = ordenarDisponiveis(dados.produtos.filter((x) => x.id !== p.id && x.categoria === p.categoria && produtoVisivel(x, ativas))).slice(0, 8);
  const msg = `Olá! Tenho interesse neste produto do catálogo Laços VIP:\n• ${p.nome} — REF ${p.ref} (${dinheiro(p.preco)} ${precoUnidade(p)})`;
  return `<nav class="migalhas" aria-label="Você está em"><a href="${base}">Início</a><span>›</span>${cat ? `<a href="${base}#produtos" data-ir-categoria="${esc(cat.id)}">${esc(cat.nome)}</a><span>›</span>` : ''}<span aria-current="page">${esc(p.nome)}</span></nav>
<article class="produto" data-produto="${esc(p.id)}">
  <div class="galeria">
    <div class="galeria-palco" data-galeria>${fotos.map((f, i) => `<button type="button" class="galeria-foto" data-zoom="${i}" aria-label="Ampliar foto ${i + 1}">
      <img src="${urlFoto(base, f, 1600)}" srcset="${srcsetFoto(base, f)}" sizes="(min-width: 900px) 50vw, 100vw" width="${f.w}" height="${f.h}" alt="${esc(p.nome)} — foto ${i + 1}" ${i === 0 ? 'fetchpriority="high"' : 'loading="lazy"'}></button>`).join('') || `<div class="sem-foto grande">${icone('laco')}</div>`}</div>
    ${fotos.length > 1 ? `<div class="miniaturas" role="tablist" aria-label="Fotos">${fotos.map((f, i) => `<button type="button" role="tab" aria-selected="${i === 0}" data-mini="${i}" aria-label="Foto ${i + 1}"><img src="${urlFoto(base, f, 400)}" alt="" loading="lazy"></button>`).join('')}</div>` : ''}
    ${fotos.length ? `<p class="dica">${icone('zoom')} Toque na foto para ampliar</p>` : ''}
  </div>
  <div class="produto-info">
    <p class="card-meta">${esc(cat ? cat.nome : '')}<span>REF ${esc(p.ref)}</span></p>
    <h1>${esc(p.nome)}</h1>
    <div class="selos-linha">${p.esgotado ? '<span class="selo selo-esgotado">Esgotado</span>' : ''}${p.novidade ? '<span class="selo selo-novo">Novidade</span>' : ''}</div>
    <p class="preco preco-grande"><strong>${dinheiro(p.preco)}</strong> <span>${esc(precoUnidade(p))}</span></p>
    ${p.descricao ? `<div class="descricao">${esc(p.descricao).replace(/\n/g, '<br>')}</div>` : ''}
    ${p.esgotado ? '<p class="aviso">Este produto está esgotado no momento. Fale conosco para saber quando volta.</p>' : `
    <div class="comprar">
      <div class="qtd" data-qtd-produto>
        <button type="button" data-qtd="-1" aria-label="Diminuir">${icone('menos')}</button>
        <input type="number" inputmode="numeric" min="1" max="999" value="1" aria-label="Quantidade">
        <button type="button" data-qtd="1" aria-label="Aumentar">${icone('mais')}</button>
      </div>
      <button type="button" class="btn btn-primario btn-grande" data-add-produto="${esc(p.id)}">${icone('sacola')}<span>Adicionar ao pedido</span></button>
    </div>`}
    <a class="btn btn-whats btn-grande" href="${linkWhats(dados.loja.whatsapp, msg)}" target="_blank" rel="noopener">${icone('whats')}<span>${p.esgotado ? 'Perguntar no WhatsApp' : 'Tirar dúvidas no WhatsApp'}</span></a>
    <div class="produto-acoes">
      <button type="button" class="btn btn-linha" data-fav="${esc(p.id)}" aria-pressed="false">${icone('coracao')}<span>Favoritar</span></button>
      <button type="button" class="btn btn-linha" data-compartilhar>${icone('compartilhar')}<span>Compartilhar</span></button>
    </div>
    ${dados.loja.pedidoMinimo ? `<p class="hero-nota">${icone('info')}<span>Venda no atacado — pedido mínimo de <strong>${dinheiro(dados.loja.pedidoMinimo)}</strong>.</span></p>` : ''}
  </div>
</article>
${relacionados.length ? `<section class="secao"><div class="secao-topo"><div><p class="sobretitulo">Combina com você</p><h2>Mais ${esc(cat ? cat.nome.toLowerCase() : 'produtos')}</h2></div></div>${carrossel(relacionados, ctx, 'Produtos relacionados')}</section>` : ''}`;
}

export function renderRodape(dados, base) {
  const l = dados.loja;
  return `<div class="rodape-grade">
  <div class="rodape-marca">
    <img src="${base}img/laco-sm.png" alt="" width="120" height="96">
    <p class="marca-nome">${esc(l.nome)}</p>
    <p>${esc(l.rodapeTexto || '')}</p>
  </div>
  <div>
    <h2>Atendimento</h2>
    <ul>
      <li><a href="${linkWhats(l.whatsapp, 'Olá! Vim pelo catálogo Laços VIP.')}" target="_blank" rel="noopener">${icone('whats')} WhatsApp ${esc(formatarFone(l.whatsapp))}</a></li>
      ${l.instagram ? `<li><a href="https://instagram.com/${esc(l.instagram.replace(/^@/, ''))}" target="_blank" rel="noopener">${icone('insta')} @${esc(l.instagram.replace(/^@/, ''))}</a></li>` : ''}
      ${l.atendimento ? `<li>${icone('relogio')} ${esc(l.atendimento)}</li>` : ''}
      ${l.endereco ? `<li>${icone('local')} ${esc(l.endereco)}</li>` : ''}
    </ul>
  </div>
  <div>
    <h2>Compra no atacado</h2>
    <ul>
      ${l.pedidoMinimo ? `<li>${icone('sacola')} Pedido mínimo de ${dinheiro(l.pedidoMinimo)}</li>` : ''}
      <li>${icone('whats')} Pedido e pagamento combinados pelo WhatsApp</li>
      <li><a href="${base}#como-comprar">${icone('info')} Como comprar</a></li>
    </ul>
  </div>
</div>
<p class="rodape-final">© ${new Date().getFullYear()} ${esc(l.nome)}. Todos os direitos reservados.</p>`;
}

export function formatarFone(n) {
  const d = String(n || '').replace(/\D/g, '').replace(/^55/, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d;
}

export { urlProduto, dinheiro };

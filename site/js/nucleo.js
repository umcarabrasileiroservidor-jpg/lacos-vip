// Núcleo compartilhado entre o site (navegador) e o gerador (Node).
// Regras de exibição, campanhas, preços e o HTML dos cartões de produto.

export const TAMANHOS_FOTO = [400, 800, 1600];
const FMT = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export const dinheiro = (v) => FMT.format(Number(v) || 0);

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function slugify(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function semAcento(s) {
  return String(s || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/** Data de hoje (AAAA-MM-DD) no fuso de Recife/Brasília. */
export function hojeBR(agora = new Date()) {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Recife', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(agora);
  const g = (t) => p.find((x) => x.type === t).value;
  return `${g('year')}-${g('month')}-${g('day')}`;
}

/** A campanha está no ar hoje? */
export function campanhaNoAr(c, hoje = hojeBR()) {
  if (!c) return false;
  if (c.estado === 'ligada') return true;
  if (c.estado === 'programada') return !!c.inicio && !!c.fim && c.inicio <= hoje && hoje <= c.fim;
  return false;
}

/** Campanhas no ar (na ordem de prioridade definida no painel). */
export function campanhasAtivas(dados, hoje = hojeBR(), previa = null) {
  if (previa) {
    const c = dados.campanhas.find((x) => x.id === previa);
    return c ? [c] : [];
  }
  if (dados.aparencia?.forcarNormal) return [];
  return dados.campanhas.filter((c) => campanhaNoAr(c, hoje));
}

/** O produto aparece na loja? */
export function produtoVisivel(p, ativas) {
  if (!p.visivel) return false;
  if (!p.somenteCampanha) return true;
  return ativas.some((c) => c.produtos.includes(p.id));
}

export function urlFoto(base, foto, tam = 800) {
  return `${base}fotos/${foto.id}-${tam}.${foto.ext || 'webp'}`;
}

export function srcsetFoto(base, foto) {
  const w = foto.w || 1600, h = foto.h || 1600, maior = Math.max(w, h);
  const vistos = new Set();
  return TAMANHOS_FOTO.map((t) => {
    const largura = Math.round(w * Math.min(1, t / maior));
    if (vistos.has(largura)) return null;
    vistos.add(largura);
    return `${urlFoto(base, foto, t)} ${largura}w`;
  }).filter(Boolean).join(', ');
}

export function urlProduto(base, p) {
  return `${base}produto/${p.slug}/`;
}

export function precoUnidade(p) {
  return p.unidade ? `/ ${p.unidade}` : '';
}

const ICONE = (nome, extra = '') => `<svg class="i ${extra}" aria-hidden="true"><use href="#i-${nome}"></use></svg>`;
export { ICONE as icone };

/** Cartão de produto (vitrine). */
export function cartaoProduto(p, ctx) {
  const { base, categorias, ativas = [], eager = false } = ctx;
  const cat = categorias.find((c) => c.id === p.categoria);
  const campanha = ativas.find((c) => c.produtos.includes(p.id));
  const fotos = p.fotos.length ? p.fotos : [null];
  const url = urlProduto(base, p);
  const imgs = fotos.map((f, i) => f
    ? `<img src="${urlFoto(base, f, 800)}" srcset="${srcsetFoto(base, f)}" sizes="(min-width: 1100px) 260px, (min-width: 700px) 30vw, 46vw" width="${f.w}" height="${f.h}" alt="${esc(p.nome)}${fotos.length > 1 ? ` — foto ${i + 1}` : ''}" ${i === 0 && eager ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">`
    : `<div class="sem-foto">${ICONE('laco')}</div>`).join('');
  const selos = [
    p.esgotado ? '<span class="selo selo-esgotado">Esgotado</span>' : '',
    campanha && campanha.tema !== 'padrao' ? `<span class="selo selo-campanha">${esc(campanha.nome)}</span>` : '',
    !p.esgotado && p.novidade ? '<span class="selo selo-novo">Novidade</span>' : '',
  ].join('');
  return `<article class="card${p.esgotado ? ' esgotado' : ''}" data-id="${esc(p.id)}">
  <div class="card-midia">
    <a class="card-fotos" href="${url}" aria-label="Ver ${esc(p.nome)}">${imgs}</a>
    ${fotos.length > 1 ? `<div class="card-pontos" aria-hidden="true">${fotos.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</div>` : ''}
    <div class="card-selos">${selos}</div>
    <button class="btn-fav" type="button" data-fav="${esc(p.id)}" aria-pressed="false" aria-label="Favoritar ${esc(p.nome)}">${ICONE('coracao')}</button>
  </div>
  <div class="card-corpo">
    <p class="card-meta">${esc(cat ? cat.nome : '')}<span>REF ${esc(p.ref)}</span></p>
    <h3 class="card-nome"><a href="${url}">${esc(p.nome)}</a></h3>
    <p class="preco"><strong>${dinheiro(p.preco)}</strong> <span>${esc(precoUnidade(p))}</span></p>
    <div class="card-acao" data-acao="${esc(p.id)}">${p.esgotado
      ? '<button class="btn btn-linha" type="button" disabled>Esgotado</button>'
      : `<button class="btn btn-add" type="button" data-add="${esc(p.id)}">${ICONE('mais')}<span>Adicionar</span></button>`}</div>
  </div>
</article>`;
}

/** Ordena: disponíveis primeiro, esgotados no fim, mantendo a ordem do painel. */
export function ordenarDisponiveis(lista) {
  return [...lista].sort((a, b) => (a.esgotado === b.esgotado ? 0 : a.esgotado ? 1 : -1));
}

/** Produtos de uma seção (novidades/destaques) respeitando a ordem escolhida. */
export function produtosDaSecao(dados, secao, ativas) {
  const mapa = new Map(dados.produtos.map((p) => [p.id, p]));
  return (secao.produtos || []).map((id) => mapa.get(id)).filter((p) => p && produtoVisivel(p, ativas) && !p.esgotado).slice(0, secao.limite || 12);
}

export function produtosDaCampanha(dados, c) {
  const mapa = new Map(dados.produtos.map((p) => [p.id, p]));
  return ordenarDisponiveis(c.produtos.map((id) => mapa.get(id)).filter((p) => p && p.visivel));
}

/** Dados públicos: sem lixeira, sem produtos ocultos, sem caminhos de originais. */
export function dadosPublicos(dados) {
  const limpaFoto = ({ id, w, h, ext }) => ({ id, w, h, ext });
  return {
    versao: dados.versao,
    atualizadoEm: dados.atualizadoEm,
    loja: dados.loja,
    categorias: dados.categorias,
    produtos: dados.produtos.filter((p) => p.visivel).map((p) => ({ ...p, fotos: p.fotos.map(limpaFoto) })),
    inicio: dados.inicio,
    aparencia: dados.aparencia,
    campanhas: dados.campanhas,
  };
}

/** Mensagem do pedido para o WhatsApp. */
export function mensagemPedido(loja, itens, extras = {}) {
  const linhas = [loja.mensagemPedido || 'Olá! Gostaria de fazer este pedido:', ''];
  let total = 0;
  for (const { p, q } of itens) {
    const sub = p.preco * q;
    total += sub;
    linhas.push(`• ${q}× ${p.nome} — REF ${p.ref}`);
    linhas.push(`   ${dinheiro(p.preco)} ${precoUnidade(p)} → ${dinheiro(sub)}`);
  }
  linhas.push('', `*Total dos produtos: ${dinheiro(total)}*`);
  if (extras.nome) linhas.push(`Nome: ${extras.nome}`);
  if (extras.cidade) linhas.push(`Cidade: ${extras.cidade}`);
  if (extras.obs) linhas.push(`Observação: ${extras.obs}`);
  return linhas.join('\n');
}

export function linkWhats(numero, texto) {
  return `https://wa.me/${String(numero).replace(/\D/g, '')}${texto ? `?text=${encodeURIComponent(texto)}` : ''}`;
}

// Comportamento da vitrine: pedido, favoritos, busca, filtros, galeria e campanhas.
import {
  esc, dinheiro, semAcento, cartaoProduto, campanhasAtivas, produtoVisivel, ordenarDisponiveis,
  urlFoto, urlProduto, precoUnidade, mensagemPedido, linkWhats, icone,
} from './nucleo.js';
import { renderFaixa, renderHero, renderSecoes } from './paginas.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const BASE = document.querySelector('meta[name="base-site"]')?.content || '/';
const dados = JSON.parse($('#dados').textContent);
const PRODUTOS = new Map(dados.produtos.map((p) => [p.id, p]));
const params = new URLSearchParams(location.search);
const previa = params.get('previa');
const ativas = campanhasAtivas(dados, undefined, previa);
const ctx = { base: BASE, categorias: dados.categorias, ativas };
const loja = dados.loja;

// ---------- armazenamento local ----------
const ler = (k, padrao) => { try { return JSON.parse(localStorage.getItem(k)) ?? padrao; } catch { return padrao; } };
const gravar = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* modo privado */ } };
let carrinho = ler('lvip-pedido', {});
let favoritos = ler('lvip-favoritos', []);
let cliente = ler('lvip-cliente', { nome: '', cidade: '' });
// remove do pedido o que não existe mais ou esgotou
for (const id of Object.keys(carrinho)) {
  const p = PRODUTOS.get(id);
  if (!p || p.esgotado || !produtoVisivel(p, ativas) || !Number.isInteger(carrinho[id]) || carrinho[id] < 1) delete carrinho[id];
}
favoritos = favoritos.filter((id) => PRODUTOS.has(id));

// ---------- avisos ----------
let tAviso;
function avisar(txt) {
  const el = $('[data-aviso]');
  el.textContent = txt;
  el.classList.add('on');
  clearTimeout(tAviso);
  tAviso = setTimeout(() => el.classList.remove('on'), 2600);
}

// ---------- campanha (aplicada pela data, sem precisar republicar) ----------
function aplicarCampanha() {
  const tema = ativas[0] && ativas[0].tema !== 'padrao' ? ativas[0].tema : '';
  document.body.classList.remove('tema-natal', 'tema-reveillon', 'sem-luzes');
  if (tema) document.body.classList.add(`tema-${tema}`);
  if (tema && ativas[0].efeitos?.luzes === false) document.body.classList.add('sem-luzes');
  const assinatura = ativas.map((c) => c.id).join(',');
  const montada = document.body.dataset.montado;
  if (montada !== assinatura || previa) {
    $('[data-faixa]').innerHTML = renderFaixa(dados, ativas);
    if ($('[data-hero]')) $('[data-hero]').innerHTML = renderHero(dados, ctx);
    if ($('[data-secoes]')) $('[data-secoes]').innerHTML = renderSecoes(dados, ctx);
    document.body.dataset.montado = assinatura;
  }
  if (previa && ativas[0]) avisar(`Prévia da campanha “${ativas[0].nome}” — só você está vendo`);
  const c = ativas[0];
  if (c && c.tema !== 'padrao') {
    if (c.musica?.ativa) import('./musica.js').then((m) => m.montarControle($('[data-musica]'), c, BASE));
    if (c.efeitos?.particulas && !matchMedia('(prefers-reduced-motion: reduce)').matches) import('./efeitos.js').then((m) => m.iniciar($('[data-efeitos]'), c.tema));
    if (c.tema === 'reveillon') contagem();
  }
}

function contagem() {
  const el = $('[data-contagem]');
  if (!el) return;
  const ano = new Date().getMonth() === 0 ? new Date().getFullYear() : new Date().getFullYear() + 1;
  const alvo = new Date(`${ano}-01-01T00:00:00-03:00`).getTime();
  const tic = () => {
    const ms = alvo - Date.now();
    if (ms <= 0 || ms > 40 * 864e5) { el.textContent = ms <= 0 && ms > -864e5 ? `✨ Feliz ${ano}!` : ''; return; }
    const d = Math.floor(ms / 864e5), h = Math.floor(ms / 36e5) % 24, m = Math.floor(ms / 6e4) % 60, s = Math.floor(ms / 1e3) % 60;
    el.textContent = `Faltam ${d ? `${d}d ` : ''}${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}min ${String(s).padStart(2, '0')}s para ${ano}`;
  };
  tic(); setInterval(tic, 1000);
}

// ---------- pedido ----------
function qtdTotal() { return Object.values(carrinho).reduce((a, b) => a + b, 0); }
function itensPedido() { return Object.entries(carrinho).map(([id, q]) => ({ p: PRODUTOS.get(id), q })).filter((x) => x.p); }
function valorTotal() { return itensPedido().reduce((s, { p, q }) => s + p.preco * q, 0); }

function definirQtd(id, q, origem) {
  const p = PRODUTOS.get(id);
  if (!p || p.esgotado) return;
  const antes = carrinho[id] || 0;
  q = Math.max(0, Math.min(999, Math.round(q)));
  if (q === 0) delete carrinho[id]; else carrinho[id] = q;
  gravar('lvip-pedido', carrinho);
  atualizarPedido();
  if (q > antes && origem !== 'gaveta') {
    avisar(`${p.nome} adicionado ao pedido`);
    const b = $('.btn-sacola'); b.classList.remove('pulsa'); void b.offsetWidth; b.classList.add('pulsa');
  }
}

function acaoCartao(id) {
  const p = PRODUTOS.get(id);
  const q = carrinho[id] || 0;
  if (p.esgotado) return '<button class="btn btn-linha" type="button" disabled>Esgotado</button>';
  if (!q) return `<button class="btn btn-add" type="button" data-add="${esc(id)}">${icone('mais')}<span>Adicionar</span></button>`;
  return `<div class="passo-qtd" role="group" aria-label="Quantidade de ${esc(p.nome)}"><button type="button" data-passo="-1" data-id="${esc(id)}" aria-label="Diminuir">${icone('menos')}</button><span aria-live="polite">${q}</span><button type="button" data-passo="1" data-id="${esc(id)}" aria-label="Aumentar">${icone('mais')}</button></div>`;
}

function atualizarPedido() {
  const n = qtdTotal();
  $$('[data-n-carrinho]').forEach((el) => { el.textContent = n; });
  $('.btn-sacola')?.setAttribute('aria-label', `Abrir pedido com ${n} ${n === 1 ? 'item' : 'itens'}`);
  $$('[data-acao]').forEach((el) => { el.innerHTML = acaoCartao(el.dataset.acao); });
  const barra = $('[data-barra-pedido]');
  barra.hidden = n === 0;
  document.body.classList.toggle('tem-barra', n > 0);
  $('[data-barra-qtd]').textContent = n;
  $('[data-barra-total]').textContent = dinheiro(valorTotal());
  if (!$('#carrinho').hidden) renderGavetaPedido();
}

function renderGavetaPedido() {
  const itens = itensPedido();
  const corpo = $('[data-itens]');
  const resumo = $('[data-resumo]');
  if (!itens.length) {
    corpo.innerHTML = `<div class="carrinho-vazio">${icone('sacola')}<p><strong>Seu pedido está vazio.</strong><br>Toque em “Adicionar” nos produtos que você gostar.</p><button type="button" class="btn btn-primario" data-fechar>Ver produtos</button></div>`;
    resumo.hidden = true;
    return;
  }
  resumo.hidden = false;
  corpo.innerHTML = itens.map(({ p, q }) => `<div class="item">
    ${p.fotos[0] ? `<img src="${urlFoto(BASE, p.fotos[0], 400)}" alt="" loading="lazy">` : `<div class="sem-foto">${icone('laco')}</div>`}
    <div><h3><a href="${urlProduto(BASE, p)}">${esc(p.nome)}</a></h3><p>REF ${esc(p.ref)} · ${dinheiro(p.preco)} ${esc(precoUnidade(p))}</p>
      <button type="button" class="item-remover" data-remover="${esc(p.id)}">Remover</button></div>
    <div class="item-dir"><strong>${dinheiro(p.preco * q)}</strong>
      <div class="passo-qtd"><button type="button" data-passo="-1" data-id="${esc(p.id)}" data-origem="gaveta" aria-label="Diminuir">${icone('menos')}</button><span>${q}</span><button type="button" data-passo="1" data-id="${esc(p.id)}" data-origem="gaveta" aria-label="Aumentar">${icone('mais')}</button></div></div>
  </div>`).join('');
  const total = valorTotal();
  const min = Number(loja.pedidoMinimo) || 0;
  const falta = Math.max(0, min - total);
  const bloqueado = falta > 0 && loja.bloquearAbaixoDoMinimo;
  resumo.innerHTML = `
    <div class="total"><span>Total dos produtos</span><strong>${dinheiro(total)}</strong></div>
    ${min ? `<div class="minimo${falta ? '' : ' ok'}">${falta ? `Faltam <strong>${dinheiro(falta)}</strong> para o pedido mínimo de ${dinheiro(min)}` : `${icone('check')} Pedido mínimo de ${dinheiro(min)} atingido`}<div class="minimo-barra"><i style="width:${Math.min(100, (total / min) * 100).toFixed(0)}%"></i></div></div>` : ''}
    <details class="dados-cliente"${cliente.nome ? ' open' : ''}><summary>Adicionar seu nome e cidade (opcional)</summary>
      <input data-cliente="nome" placeholder="Seu nome" value="${esc(cliente.nome)}" autocomplete="name">
      <input data-cliente="cidade" placeholder="Sua cidade" value="${esc(cliente.cidade)}" autocomplete="address-level2">
    </details>
    <button type="button" class="btn btn-whats btn-grande" data-finalizar ${bloqueado ? 'disabled' : ''}>${icone('whats')}<span>Enviar pedido pelo WhatsApp</span></button>
    <p class="minimo" style="text-align:center;margin:0">Pagamento e entrega são combinados na conversa.</p>`;
}

function finalizar() {
  const itens = itensPedido().filter(({ p }) => !p.esgotado);
  if (!itens.length) return;
  const texto = mensagemPedido(loja, itens, cliente);
  window.open(linkWhats(loja.whatsapp, texto), '_blank', 'noopener');
}

// ---------- favoritos ----------
function atualizarFavoritos() {
  $$('[data-fav]').forEach((b) => {
    const on = favoritos.includes(b.dataset.fav);
    b.setAttribute('aria-pressed', String(on));
    const span = b.querySelector('span');
    if (span) span.textContent = on ? 'Favoritado' : 'Favoritar';
  });
  const n = favoritos.length;
  const bolha = $('[data-n-fav]');
  bolha.textContent = n; bolha.hidden = !n;
  if (!$('#favoritos').hidden) renderFavoritos();
}
function renderFavoritos() {
  const lista = favoritos.map((id) => PRODUTOS.get(id)).filter((p) => p && produtoVisivel(p, ativas));
  $('[data-favs]').innerHTML = lista.length
    ? `<div class="grade">${lista.map((p) => cartaoProduto(p, ctx)).join('')}</div>`
    : `<div class="carrinho-vazio">${icone('coracao')}<p><strong>Nenhum favorito ainda.</strong><br>Toque no coração para guardar produtos e ver depois.</p></div>`;
  $$('#favoritos [data-acao]').forEach((el) => { el.innerHTML = acaoCartao(el.dataset.acao); });
  atualizarBotoesFav($('#favoritos'));
}
function atualizarBotoesFav(raiz) {
  $$('[data-fav]', raiz).forEach((b) => b.setAttribute('aria-pressed', String(favoritos.includes(b.dataset.fav))));
}
function alternarFavorito(id) {
  const on = favoritos.includes(id);
  favoritos = on ? favoritos.filter((x) => x !== id) : [...favoritos, id];
  gravar('lvip-favoritos', favoritos);
  atualizarFavoritos();
  avisar(on ? 'Removido dos favoritos' : 'Salvo nos favoritos ♥');
}

// ---------- gavetas ----------
let ultimoFoco;
function abrir(nome) {
  const g = $(`[data-gaveta="${nome}"]`);
  ultimoFoco = document.activeElement;
  if (nome === 'carrinho') renderGavetaPedido();
  if (nome === 'favoritos') renderFavoritos();
  g.hidden = false;
  document.documentElement.style.overflow = 'hidden';
  g.querySelector('.gaveta-topo button').focus();
}
function fecharGavetas() {
  $$('[data-gaveta]').forEach((g) => { g.hidden = true; });
  document.documentElement.style.overflow = '';
  ultimoFoco?.focus?.();
}

// ---------- filtros e busca (página inicial) ----------
const filtro = { cat: '', q: params.get('q') || '', ordem: '' };
function listaFiltrada() {
  let lista = dados.produtos.filter((p) => produtoVisivel(p, ativas));
  if (filtro.cat) lista = lista.filter((p) => p.categoria === filtro.cat);
  if (filtro.q) {
    const termos = semAcento(filtro.q).split(/\s+/).filter(Boolean);
    lista = lista.filter((p) => {
      const alvo = semAcento(`${p.nome} ${p.ref} ${p.descricao} ${dados.categorias.find((c) => c.id === p.categoria)?.nome || ''}`);
      return termos.every((t) => alvo.includes(t));
    });
  }
  if (filtro.ordem === 'menor') lista.sort((a, b) => a.preco - b.preco);
  else if (filtro.ordem === 'maior') lista.sort((a, b) => b.preco - a.preco);
  else if (filtro.ordem === 'az') lista.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  return ordenarDisponiveis(lista);
}
function aplicarFiltro() {
  const grade = $('[data-grade]');
  if (!grade) return;
  const lista = listaFiltrada();
  grade.innerHTML = lista.map((p) => cartaoProduto(p, ctx)).join('');
  $('[data-vazio]').hidden = lista.length > 0;
  $('[data-contador]').textContent = `${lista.length} ${lista.length === 1 ? 'produto' : 'produtos'}${filtro.q ? ` para “${filtro.q}”` : ''}`;
  $$('.chip').forEach((c) => { const on = c.dataset.cat === filtro.cat; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
  $$('[data-acao]', grade).forEach((el) => { el.innerHTML = acaoCartao(el.dataset.acao); });
  atualizarBotoesFav(grade);
}
function irParaProdutos() { $('#produtos')?.scrollIntoView({ behavior: 'smooth' }); }

function sugestoes(termo) {
  const caixa = $('[data-sugestoes]');
  const t = semAcento(termo.trim());
  if (t.length < 2) { caixa.hidden = true; return; }
  const achados = dados.produtos.filter((p) => produtoVisivel(p, ativas) && semAcento(`${p.nome} ${p.ref}`).includes(t)).slice(0, 6);
  caixa.innerHTML = (achados.length ? achados.map((p) => `<a class="sugestao" href="${urlProduto(BASE, p)}">${p.fotos[0] ? `<img src="${urlFoto(BASE, p.fotos[0], 400)}" alt="">` : ''}<span>${esc(p.nome)}<small>${dinheiro(p.preco)} ${esc(precoUnidade(p))} · REF ${esc(p.ref)}</small></span></a>`).join('') : '<p class="sugestao">Nenhum produto com esse nome.</p>')
    + `<button type="submit" class="sugestao-todos">Ver todos os resultados para “${esc(termo.trim())}”</button>`;
  caixa.hidden = false;
}

// ---------- galeria da página de produto + zoom ----------
let zoomFotos = [], zoomI = 0, escala = 1, desloc = { x: 0, y: 0 };
function abrirZoom(fotos, i) {
  zoomFotos = fotos; zoomI = i;
  $('[data-zoom-tela]').hidden = false;
  document.documentElement.style.overflow = 'hidden';
  mostrarZoom();
  $('[data-zoom-fechar]').focus();
}
function mostrarZoom() {
  escala = 1; desloc = { x: 0, y: 0 };
  const f = zoomFotos[zoomI];
  $('[data-zoom-palco]').innerHTML = `<img src="${urlFoto(BASE, f, 1600)}" alt="Foto ${zoomI + 1} ampliada">`;
  $('[data-zoom-info]').textContent = `${zoomI + 1} de ${zoomFotos.length} · toque duas vezes ou use dois dedos para aproximar`;
  $$('.zoom-ant, .zoom-prox').forEach((b) => { b.hidden = zoomFotos.length < 2; });
}
function transformarZoom() {
  const img = $('[data-zoom-palco] img');
  if (img) img.style.transform = `translate(${desloc.x}px, ${desloc.y}px) scale(${escala})`;
}
function fecharZoom() { $('[data-zoom-tela]').hidden = true; document.documentElement.style.overflow = ''; }
function passoZoom(d) { zoomI = (zoomI + d + zoomFotos.length) % zoomFotos.length; mostrarZoom(); }

function prepararZoomGestos() {
  const palco = $('[data-zoom-palco]');
  const pontos = new Map();
  let distIni = 0, escalaIni = 1, inicio = null, ultimoToque = 0;
  palco.addEventListener('pointerdown', (e) => {
    pontos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    palco.setPointerCapture(e.pointerId);
    if (pontos.size === 2) { const [a, b] = [...pontos.values()]; distIni = Math.hypot(a.x - b.x, a.y - b.y); escalaIni = escala; }
    else inicio = { x: e.clientX, y: e.clientY, dx: desloc.x, dy: desloc.y };
    const agora = Date.now();
    if (pontos.size === 1 && agora - ultimoToque < 300) { escala = escala > 1 ? 1 : 2.5; desloc = { x: 0, y: 0 }; transformarZoom(); }
    ultimoToque = agora;
  });
  palco.addEventListener('pointermove', (e) => {
    if (!pontos.has(e.pointerId)) return;
    pontos.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pontos.size === 2) {
      const [a, b] = [...pontos.values()];
      escala = Math.min(5, Math.max(1, escalaIni * Math.hypot(a.x - b.x, a.y - b.y) / distIni));
      transformarZoom();
    } else if (inicio && escala > 1) {
      desloc = { x: inicio.dx + e.clientX - inicio.x, y: inicio.dy + e.clientY - inicio.y };
      transformarZoom();
    }
  });
  const fim = (e) => {
    if (inicio && escala === 1 && pontos.size === 1) {
      const dx = e.clientX - inicio.x;
      if (Math.abs(dx) > 60) passoZoom(dx < 0 ? 1 : -1);
    }
    pontos.delete(e.pointerId);
    if (!pontos.size) inicio = null;
  };
  palco.addEventListener('pointerup', fim);
  palco.addEventListener('pointercancel', fim);
  palco.addEventListener('wheel', (e) => { e.preventDefault(); escala = Math.min(5, Math.max(1, escala - e.deltaY * 0.002)); if (escala === 1) desloc = { x: 0, y: 0 }; transformarZoom(); }, { passive: false });
}

function prepararProduto() {
  const art = $('[data-produto]');
  if (!art) return;
  const p = PRODUTOS.get(art.dataset.produto);
  const palco = $('[data-galeria]');
  if (palco && p) {
    palco.addEventListener('scroll', () => {
      const i = Math.round(palco.scrollLeft / palco.clientWidth);
      $$('[data-mini]').forEach((b) => b.setAttribute('aria-selected', String(Number(b.dataset.mini) === i)));
    }, { passive: true });
  }
  const campo = $('[data-qtd-produto] input');
  if (p && carrinho[p.id] && campo) campo.value = carrinho[p.id];
}

// ---------- pontos das fotos nos cartões ----------
document.addEventListener('scroll', (e) => {
  const el = e.target;
  if (!(el instanceof Element) || !el.classList.contains('card-fotos')) return;
  const i = Math.round(el.scrollLeft / el.clientWidth);
  el.parentElement.querySelectorAll('.card-pontos i').forEach((p, j) => p.classList.toggle('on', i === j));
}, { capture: true, passive: true });

// ---------- cliques ----------
document.addEventListener('click', async (e) => {
  const t = e.target.closest('button, a, [data-fechar]');
  if (!t) return;
  const d = t.dataset;
  if (d.add) { definirQtd(d.add, (carrinho[d.add] || 0) + 1); return; }
  if (d.passo) { definirQtd(d.id, (carrinho[d.id] || 0) + Number(d.passo), d.origem); return; }
  if (d.remover) { definirQtd(d.remover, 0, 'gaveta'); return; }
  if (d.fav) { alternarFavorito(d.fav); return; }
  if (d.abrir) { abrir(d.abrir); return; }
  if ('fechar' in d) { fecharGavetas(); return; }
  if ('finalizar' in d) { finalizar(); return; }
  if (d.cat !== undefined && t.classList.contains('chip')) { filtro.cat = d.cat; aplicarFiltro(); return; }
  if ('limpar' in d) { filtro.cat = ''; filtro.q = ''; $('#campo-busca').value = ''; aplicarFiltro(); return; }
  if (d.irCategoria) {
    if ($('[data-grade]')) { e.preventDefault(); filtro.cat = d.irCategoria; filtro.q = ''; aplicarFiltro(); irParaProdutos(); }
    else { e.preventDefault(); location.href = `${BASE}?cat=${encodeURIComponent(d.irCategoria)}#produtos`; }
    return;
  }
  if (d.rolar) {
    const c = t.closest('.secao').querySelector('.carrossel');
    c.scrollBy({ left: Number(d.rolar) * c.clientWidth * 0.9, behavior: 'smooth' });
    return;
  }
  if (d.mini !== undefined) { const palco = $('[data-galeria]'); palco.scrollTo({ left: palco.clientWidth * Number(d.mini), behavior: 'smooth' }); return; }
  if (d.zoom !== undefined) { const p = PRODUTOS.get($('[data-produto]').dataset.produto); abrirZoom(p.fotos, Number(d.zoom)); return; }
  if ('zoomFechar' in d) { fecharZoom(); return; }
  if (d.zoomPasso) { passoZoom(Number(d.zoomPasso)); return; }
  if (d.qtd) { const campo = t.parentElement.querySelector('input'); campo.value = Math.max(1, Math.min(999, (Number(campo.value) || 1) + Number(d.qtd))); return; }
  if (d.addProduto) {
    const q = Math.max(1, Math.min(999, Number($('[data-qtd-produto] input').value) || 1));
    definirQtd(d.addProduto, q);
    return;
  }
  if ('compartilhar' in d) {
    const p = PRODUTOS.get($('[data-produto]').dataset.produto);
    const dadosShare = { title: p.nome, text: `${p.nome} — ${dinheiro(p.preco)} ${precoUnidade(p)}`, url: location.href.split('?')[0] };
    if (navigator.share) { try { await navigator.share(dadosShare); } catch { /* cancelado */ } }
    else { try { await navigator.clipboard.writeText(dadosShare.url); avisar('Link copiado!'); } catch { avisar(dadosShare.url); } }
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { if (!$('[data-zoom-tela]').hidden) fecharZoom(); else fecharGavetas(); $('[data-sugestoes]').hidden = true; }
  if (!$('[data-zoom-tela]').hidden && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) passoZoom(e.key === 'ArrowLeft' ? -1 : 1);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.id === 'campo-busca') {
    sugestoes(t.value);
    if ($('[data-grade]') && !t.value.trim() && filtro.q) { filtro.q = ''; aplicarFiltro(); }
  }
  if (t.dataset.cliente) { cliente[t.dataset.cliente] = t.value.slice(0, 80); gravar('lvip-cliente', cliente); }
});
document.addEventListener('change', (e) => { if (e.target.matches('[data-ordem]')) { filtro.ordem = e.target.value; aplicarFiltro(); } });
document.addEventListener('submit', (e) => {
  if (!e.target.matches('[data-busca]')) return;
  const q = $('#campo-busca').value.trim();
  $('[data-sugestoes]').hidden = true;
  if ($('[data-grade]')) { e.preventDefault(); filtro.q = q; filtro.cat = ''; aplicarFiltro(); irParaProdutos(); $('#campo-busca').blur(); }
  else { e.preventDefault(); location.href = `${BASE}?q=${encodeURIComponent(q)}#produtos`; }
});
document.addEventListener('pointerdown', (e) => { if (!e.target.closest('[data-busca]')) $('[data-sugestoes]').hidden = true; });

// ---------- início ----------
function medirTopo() { document.documentElement.style.setProperty('--altura-topo', `${$('.topo').offsetHeight}px`); }
aplicarCampanha();
if (params.get('cat')) filtro.cat = params.get('cat');
if (filtro.q) $('#campo-busca').value = filtro.q;
if (filtro.q || filtro.cat) { aplicarFiltro(); requestAnimationFrame(irParaProdutos); }
prepararProduto();
prepararZoomGestos();
atualizarPedido();
atualizarFavoritos();
medirTopo();
addEventListener('resize', medirTopo, { passive: true });

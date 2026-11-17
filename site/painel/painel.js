// Painel administrativo do catálogo Laços VIP.
// Tudo o que você altera aqui fica guardado como rascunho até apertar "Publicar no site".
import { ArmazemGitHub, ArmazemLocal, ErroConflito, ErroAcesso, arquivosReferenciados } from './armazem.js';
import { processarFoto, processarAudio } from './fotos.js';
import { dinheiro, esc, slugify, semAcento, campanhaNoAr, hojeBR } from '../js/nucleo.js';

const BASE = new URL('../', location.href).pathname;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const clonar = (o) => JSON.parse(JSON.stringify(o));
const CHAVE_ACESSO = 'lvip-painel-acesso';

const E = {
  armazem: null, dados: null, original: null, versao: null,
  pendentes: new Map(),   // caminho -> Blob (arquivos novos ainda não publicados)
  previas: new Map(),     // id da foto -> URL temporária para mostrar no painel
  recuperarDe: null, sujo: false, publicando: false, ultimaPublicacao: null,
  filtro: { q: '', cat: '', status: '' },
};

/* ------------------------------------------------------------------ utilidades */
let tToast;
function toast(msg) { const t = $('[data-toast]'); t.textContent = msg; t.classList.add('on'); clearTimeout(tToast); tToast = setTimeout(() => t.classList.remove('on'), 3200); }
const precoBR = (v) => (Number(v) || 0).toFixed(2).replace('.', ',');
const lerPreco = (s) => { const n = Number(String(s).replace(/[^\d,.-]/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const dataBR = (iso) => new Date(iso).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const diaBR = (d) => (d ? d.split('-').reverse().join('/') : '');
const novoIdProduto = () => `produto-${crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)}`;
const catNome = (id) => E.dados.categorias.find((c) => c.id === id)?.nome || '—';
const produto = (id) => E.dados.produtos.find((p) => p.id === id);
const secao = (tipo) => E.dados.inicio.secoes.find((s) => s.tipo === tipo);
const campanha = (id) => E.dados.campanhas.find((c) => c.id === id);

function srcFoto(f, t = 400) {
  if (!f) return '';
  if (E.previas.has(f.id)) return E.previas.get(f.id);
  return `${BASE}fotos/${f.id}-${t}.${f.ext || 'webp'}`;
}
function imgFoto(f, t = 400, alt = '') {
  if (!f) return '<div class="sem"></div>';
  const bruto = E.armazem?.urlArquivoBruto(`fotos/${f.id}-${t}.${f.ext || 'webp'}`);
  return `<img src="${srcFoto(f, t)}" alt="${esc(alt)}" loading="lazy"${bruto ? ` onerror="this.onerror=null;this.src='${bruto}'"` : ''}>`;
}

function setar(obj, caminho, valor) {
  const partes = caminho.split('.');
  let o = obj;
  for (const p of partes.slice(0, -1)) { o[p] ??= {}; o = o[p]; }
  o[partes.at(-1)] = valor;
}
function obter(obj, caminho) { return caminho.split('.').reduce((o, p) => (o == null ? o : o[p]), obj); }

function alvo(nome) {
  const [tipo, id] = nome.split(':');
  if (tipo === 'loja') return E.dados.loja;
  if (tipo === 'hero') return E.dados.inicio.hero;
  if (tipo === 'aparencia') return E.dados.aparencia;
  if (tipo === 'produto') return produto(id);
  if (tipo === 'categoria') return E.dados.categorias.find((c) => c.id === id);
  if (tipo === 'secao') return secao(id);
  if (tipo === 'banner') return E.dados.inicio.banners.find((b) => b.id === id);
  if (tipo === 'campanha') return campanha(id);
  throw new Error(`alvo desconhecido: ${nome}`);
}
function listaDe(nome) {
  const [tipo, id] = nome.split(':');
  if (tipo === 'secao') { const s = secao(id); s.produtos ??= []; return s.produtos; }
  if (tipo === 'campanha') return campanha(id).produtos;
  throw new Error(`lista desconhecida: ${nome}`);
}

/* ------------------------------------------------------------------ rascunho e publicação */
function marcarSujo() {
  E.sujo = true;
  try { localStorage.setItem('lvip-rascunho', JSON.stringify({ versao: E.versao, dados: E.dados, quando: Date.now() })); } catch { /* sem espaço */ }
  renderBarra();
}
function sincronizar() {
  const nov = new Set(secao('novidades')?.produtos || []);
  const des = new Set(secao('destaques')?.produtos || []);
  for (const p of E.dados.produtos) { p.novidade = nov.has(p.id); p.destaque = des.has(p.id); }
  const ids = new Set(E.dados.produtos.map((p) => p.id));
  for (const s of E.dados.inicio.secoes) if (s.produtos) s.produtos = s.produtos.filter((id) => ids.has(id));
  for (const c of E.dados.campanhas) c.produtos = c.produtos.filter((id) => ids.has(id));
}
function validar() {
  const erros = [];
  for (const p of E.dados.produtos) {
    if (!p.nome.trim()) erros.push(`Um produto (REF ${p.ref}) está sem nome.`);
    if (!(p.preco > 0)) erros.push(`“${p.nome || 'REF ' + p.ref}” está sem preço.`);
    if (!E.dados.categorias.some((c) => c.id === p.categoria)) erros.push(`“${p.nome}” está sem categoria.`);
  }
  for (const c of E.dados.campanhas) if (c.estado === 'programada' && (!c.inicio || !c.fim || c.inicio > c.fim)) erros.push(`A campanha “${c.nome}” está programada, mas as datas estão incompletas ou invertidas.`);
  if (!String(E.dados.loja.whatsapp).replace(/\D/g, '')) erros.push('O número de WhatsApp da loja está vazio.');
  return erros;
}
function resumoMudancas() {
  const antes = new Map((E.original?.produtos || []).map((p) => [p.id, JSON.stringify(p)]));
  let novos = 0, alterados = 0;
  for (const p of E.dados.produtos) { if (!antes.has(p.id)) novos++; else if (antes.get(p.id) !== JSON.stringify(p)) alterados++; }
  const excluidos = (E.dados.lixeira || []).length - (E.original?.lixeira || []).length;
  const partes = [];
  if (novos) partes.push(`${novos} produto(s) novo(s)`);
  if (alterados) partes.push(`${alterados} produto(s) alterado(s)`);
  if (excluidos > 0) partes.push(`${excluidos} na lixeira`);
  if (JSON.stringify(E.dados.campanhas) !== JSON.stringify(E.original?.campanhas)) partes.push('campanhas');
  if (JSON.stringify(E.dados.inicio) !== JSON.stringify(E.original?.inicio)) partes.push('página inicial');
  if (JSON.stringify(E.dados.loja) !== JSON.stringify(E.original?.loja)) partes.push('configurações');
  if (JSON.stringify(E.dados.categorias) !== JSON.stringify(E.original?.categorias)) partes.push('categorias');
  return partes.join(', ') || 'ajustes';
}

async function publicar() {
  if (E.publicando) return;
  sincronizar();
  const erros = validar();
  if (erros.length) return modal({ titulo: 'Falta pouco para publicar', corpo: `<p>Corrija estes pontos antes:</p><ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul>`, botoes: [{ texto: 'Entendi', primario: true }] });
  for (const p of E.dados.produtos) { if (p._novo) { p.slug = slugUnico(p.nome, p.id); delete p._novo; } if (!p.slug) p.slug = slugUnico(p.nome, p.id); }
  for (const b of E.dados.inicio.banners || []) delete b._aberto;
  E.publicando = true; renderBarra('Publicando…');
  const usados = new Set(arquivosReferenciados(E.dados));
  const arquivos = [...E.pendentes].filter(([c]) => usados.has(c)).map(([caminho, blob]) => ({ caminho, blob }));
  const remover = arquivosReferenciados(E.original || { produtos: [] }).filter((c) => !usados.has(c));
  const resumo = resumoMudancas();
  E.dados.atualizadoEm = new Date().toISOString();
  try {
    const r = await E.armazem.publicar({ dados: E.dados, arquivos, remover, mensagem: `Painel: ${resumo}`, versaoBase: E.versao, recuperarDe: E.recuperarDe }, (msg) => renderBarra(msg));
    E.versao = r.versao; E.original = clonar(E.dados); E.pendentes.clear(); E.recuperarDe = null; E.sujo = false;
    E.ultimaPublicacao = E.dados.atualizadoEm;
    E.publicando = false;
    localStorage.removeItem('lvip-rascunho');
    renderBarra();
    acompanharSite(E.dados.atualizadoEm);
  } catch (e) {
    E.publicando = false; renderBarra();
    if (e instanceof ErroConflito) {
      modal({ titulo: 'O catálogo mudou em outro lugar', corpo: `<p>${esc(e.message)}</p><p>Para não apagar nada, baixe suas alterações como arquivo e depois recarregue o painel. Se quiser, você pode reaplicá-las em <b>Backup › Restaurar de um arquivo</b>.</p>`, botoes: [{ texto: 'Baixar minhas alterações', acao: baixarBackup }, { texto: 'Recarregar painel', primario: true, acao: () => { localStorage.removeItem('lvip-rascunho'); location.reload(); } }] });
    } else if (e instanceof ErroAcesso) {
      modal({ titulo: 'Acesso recusado', corpo: `<p>${esc(e.message)}</p><p>Vá em <b>Configurações › Acesso ao painel</b> e cole uma chave nova.</p>`, botoes: [{ texto: 'Ok', primario: true }] });
    } else {
      modal({ titulo: 'Não foi possível publicar', corpo: `<p>${esc(e.message || e)}</p><p>Suas alterações continuam aqui. Verifique a internet e tente de novo.</p>`, botoes: [{ texto: 'Ok', primario: true }] });
    }
    return;
  }
  E.publicando = false;
}

async function acompanharSite(marca) {
  // espera o site publicado mostrar a versão nova
  const inicio = Date.now();
  while (E.ultimaPublicacao === marca && Date.now() - inicio < 6 * 60 * 1000) {
    try {
      const r = await fetch(`${BASE}dados.json?t=${Date.now()}`, { cache: 'no-store' });
      if (r.ok && (await r.json()).atualizadoEm === marca) { E.ultimaPublicacao = null; renderBarra(); toast('Pronto! O site já está atualizado.'); return; }
    } catch { /* tenta de novo */ }
    await new Promise((ok) => setTimeout(ok, 5000));
  }
  if (E.ultimaPublicacao === marca) { E.ultimaPublicacao = null; renderBarra(); }
}

function renderBarra(msg) {
  const barra = $('[data-barra]');
  if (!barra) return;
  let cls = 'publicar', html = '';
  if (E.publicando) html = `<p>⏳ ${esc(msg || 'Publicando…')}</p>`;
  else if (E.sujo) html = `<p>Você tem alterações ainda não publicadas<small>${E.recuperarDe ? 'Versão antiga carregada — publique para aplicar' : 'Os clientes só veem depois de publicar'}</small></p>
      <button class="btn btn-peq btn-claro" data-acao="descartar">Descartar</button><button class="btn btn-p" data-acao="publicar">Publicar no site</button>`;
  else if (E.ultimaPublicacao) { cls = 'publicar ok'; html = '<p>✓ Publicado! <small>O site leva cerca de 1 minuto para mostrar as mudanças.</small></p><a class="btn btn-peq btn-claro" href="../" target="_blank">Ver site</a>'; }
  // só redesenha quando muda (senão um toque em "Publicar" logo após digitar se perde)
  const chave = cls + html;
  if (barra.dataset.chave === chave) return;
  barra.dataset.chave = chave;
  barra.hidden = !html; barra.className = cls; barra.innerHTML = html;
}

/* ------------------------------------------------------------------ modal */
function modal({ titulo, corpo, botoes = [{ texto: 'Fechar' }], aoAbrir }) {
  const camada = $('[data-modal]');
  camada.innerHTML = `<div class="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo"><div class="modal-topo"><h2 id="modal-titulo">${esc(titulo)}</h2></div><div class="modal-corpo">${corpo}</div><div class="modal-rodape">${botoes.map((b, i) => `<button class="btn ${b.primario ? 'btn-p' : ''} ${b.perigo ? 'btn-perigo cheio' : ''}" data-modal-botao="${i}">${esc(b.texto)}</button>`).join('')}</div></div>`;
  camada.hidden = false;
  const fechar = () => { camada.hidden = true; camada.innerHTML = ''; };
  camada.onclick = async (e) => {
    if (e.target === camada) return fechar();
    const b = e.target.closest('[data-modal-botao]');
    if (!b) return;
    const conf = botoes[Number(b.dataset.modalBotao)];
    const manter = conf.acao ? await conf.acao(camada) : false;
    if (manter !== true) fechar();
  };
  aoAbrir?.(camada);
  (camada.querySelector('input') || camada.querySelector('.btn-p') || camada.querySelector('button'))?.focus();
}
function confirmar(titulo, texto, rotulo = 'Confirmar', perigo = false) {
  return new Promise((ok) => modal({ titulo, corpo: `<p>${texto}</p>`, botoes: [{ texto: 'Cancelar', acao: () => ok(false) }, { texto: rotulo, primario: !perigo, perigo, acao: () => ok(true) }] }));
}

/* ------------------------------------------------------------------ componentes */
const sw = (alvoNome, campo, rotulo, valor, ajuda = '', rerender = false) =>
  `<label class="sw"><input type="checkbox" data-alvo="${alvoNome}" data-campo="${campo}" ${valor ? 'checked' : ''} ${rerender ? 'data-rerender' : ''}><span class="trilho"></span><span>${rotulo}${ajuda ? `<small>${ajuda}</small>` : ''}</span></label>`;
const campo = (alvoNome, nome, rotulo, valor, { tipo = 'text', ajuda = '', ph = '', attrs = '' } = {}) =>
  `<label class="campo"><span>${rotulo}</span>${tipo === 'textarea'
    ? `<textarea data-alvo="${alvoNome}" data-campo="${nome}" placeholder="${esc(ph)}" ${attrs}>${esc(valor ?? '')}</textarea>`
    : `<input type="${tipo}" data-alvo="${alvoNome}" data-campo="${nome}" value="${esc(valor ?? '')}" placeholder="${esc(ph)}" ${attrs}>`}${ajuda ? `<small>${ajuda}</small>` : ''}</label>`;

function gerenciadorLista(nomeLista, { vazio = 'Nenhum produto escolhido.', mostrarSoCampanha = false } = {}) {
  const ids = listaDe(nomeLista);
  return `<div class="selecionados">${ids.map((id, i) => {
    const p = produto(id);
    if (!p) return '';
    return `<div class="sel">${imgFoto(p.fotos[0])}<div><p>${esc(p.nome)} <small>REF ${esc(p.ref)} · ${dinheiro(p.preco)}${p.visivel ? '' : ' · oculto'}${p.esgotado ? ' · esgotado' : ''}</small></p>
      ${mostrarSoCampanha ? `<label class="sw" style="padding:2px 0"><input type="checkbox" data-alvo="produto:${p.id}" data-campo="somenteCampanha" ${p.somenteCampanha ? 'checked' : ''}><span class="trilho"></span><span style="font-size:12.5px">Só aparece durante a campanha</span></label>` : ''}</div>
      <div class="linha-botoes"><button class="btn btn-ico" title="Subir" data-acao="lista-mover" data-lista="${nomeLista}" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑</button><button class="btn btn-ico" title="Descer" data-acao="lista-mover" data-lista="${nomeLista}" data-i="${i}" data-d="1" ${i === ids.length - 1 ? 'disabled' : ''}>↓</button><button class="btn btn-ico btn-perigo" title="Tirar da lista" data-acao="lista-tirar" data-lista="${nomeLista}" data-i="${i}">✕</button></div></div>`;
  }).join('') || `<p class="vazio">${vazio}</p>`}</div>
  <p class="linha-botoes" style="margin-top:10px"><button class="btn" data-acao="lista-escolher" data-lista="${nomeLista}">＋ Adicionar produtos</button></p>`;
}

function escolherProdutos(nomeLista) {
  const atuais = new Set(listaDe(nomeLista));
  modal({
    titulo: 'Escolher produtos',
    corpo: `<input type="search" placeholder="Buscar por nome ou REF…" data-busca-escolher style="margin-bottom:10px"><div class="escolher">${E.dados.produtos.map((p) => `<label data-nome="${esc(semAcento(p.nome + ' ' + p.ref))}"><input type="checkbox" value="${esc(p.id)}" ${atuais.has(p.id) ? 'checked' : ''}>${imgFoto(p.fotos[0])}<span>${esc(p.nome)}<br><small>REF ${esc(p.ref)} · ${esc(catNome(p.categoria))} · ${dinheiro(p.preco)}</small></span></label>`).join('')}</div>`,
    botoes: [{ texto: 'Cancelar' }, { texto: 'Confirmar', primario: true, acao: (c) => {
      const marcados = $$('.escolher input:checked', c).map((i) => i.value);
      const lista = listaDe(nomeLista);
      const mantidos = lista.filter((id) => marcados.includes(id));
      const novos = marcados.filter((id) => !lista.includes(id));
      lista.splice(0, lista.length, ...mantidos, ...novos);
      marcarSujo(); render();
    } }],
    aoAbrir: (c) => $('[data-busca-escolher]', c).addEventListener('input', (e) => {
      const t = semAcento(e.target.value);
      $$('.escolher label', c).forEach((l) => { l.hidden = !l.dataset.nome.includes(t); });
    }),
  });
}

/* ------------------------------------------------------------------ telas */
const MENU = [
  ['produtos', '🎀', 'Produtos'], ['categorias', '🗂️', 'Categorias'], ['inicio', '🏠', 'Página inicial'],
  ['campanhas', '🎄', 'Campanhas'], ['ajustes', '⚙️', 'Configurações'], ['backup', '🛟', 'Backup'],
];
const MENU_CEL = ['produtos', 'inicio', 'campanhas', 'ajustes', 'backup'];

function rota() { const h = location.hash.replace(/^#\/?/, ''); const [nome, id] = h.split('/'); return { nome: nome || 'produtos', id: id ? decodeURIComponent(id) : null }; }

function render() {
  const r = rota();
  const principal = r.nome === 'produto' ? 'produtos' : r.nome === 'campanha' ? 'campanhas' : r.nome;
  const telas = { produtos: telaProdutos, produto: telaProduto, categorias: telaCategorias, inicio: telaInicio, campanhas: telaCampanhas, campanha: telaCampanha, ajustes: telaAjustes, backup: telaBackup };
  const tela = (telas[r.nome] || telaProdutos)(r.id);
  const rolagem = scrollY;
  $('#app').innerHTML = `<div class="estrutura">
  <nav class="lateral" aria-label="Menu"><a class="marca" href="#/produtos"><img src="../img/laco-sm.png" alt="">Laços VIP</a>
    ${MENU.map(([id, ico, nome]) => `<a class="item" href="#/${id}" ${principal === id ? 'aria-current="page"' : ''}><span>${ico}</span>${nome}</a>`).join('')}
    <div class="rodape-lateral"><a class="btn" href="../" target="_blank">Ver site ↗</a>${E.armazem.tipo === 'local' ? '<span class="ajuda">Modo de teste (computador)</span>' : ''}</div></nav>
  <div class="principal">
    <header class="topo"><a class="marca" href="#/produtos"><img src="../img/laco-sm.png" alt=""></a><h1>${esc(tela.titulo)}</h1><a class="btn btn-peq" href="../" target="_blank">Ver site ↗</a></header>
    <div class="conteudo">${tela.html}</div>
  </div>
  <nav class="abas" aria-label="Menu">${MENU.filter(([id]) => MENU_CEL.includes(id)).map(([id, ico, nome]) => `<a href="#/${id}" ${principal === id ? 'aria-current="page"' : ''}><span class="ico">${ico}</span>${nome.replace('Página inicial', 'Início').replace('Configurações', 'Ajustes')}</a>`).join('')}</nav>
  <div data-barra hidden></div>
</div>`;
  renderBarra();
  if (E.manterRolagem) { scrollTo(0, rolagem); E.manterRolagem = false; }
  if (E.focar) { $(E.focar)?.focus(); E.focar = null; }
}

/* ---------- Produtos ---------- */
function telaProdutos() {
  const f = E.filtro;
  let lista = E.dados.produtos.map((p, i) => ({ p, i }));
  if (f.q) { const t = semAcento(f.q); lista = lista.filter(({ p }) => semAcento(`${p.nome} ${p.ref}`).includes(t)); }
  if (f.cat) lista = lista.filter(({ p }) => p.categoria === f.cat);
  const nov = new Set(secao('novidades')?.produtos), des = new Set(secao('destaques')?.produtos);
  if (f.status === 'ocultos') lista = lista.filter(({ p }) => !p.visivel);
  if (f.status === 'esgotados') lista = lista.filter(({ p }) => p.esgotado);
  if (f.status === 'novidades') lista = lista.filter(({ p }) => nov.has(p.id));
  if (f.status === 'destaques') lista = lista.filter(({ p }) => des.has(p.id));
  if (f.status === 'baixa') lista = lista.filter(({ p }) => p.fotos.some((x) => Math.max(x.w, x.h) < 800) || !p.fotos.length);
  const filtrando = f.q || f.cat || f.status;
  const total = E.dados.produtos.length, visiveis = E.dados.produtos.filter((p) => p.visivel).length;
  return { titulo: 'Produtos', html: `
  <div class="titulo-pagina"><div><h2>Seus produtos</h2><p>${total} cadastrados · ${visiveis} visíveis · ${E.dados.produtos.filter((p) => p.esgotado).length} esgotados</p></div>
    <div class="linha-botoes"><a class="btn" href="#/categorias">Categorias</a><button class="btn btn-p" data-acao="novo-produto">＋ Novo produto</button></div></div>
  <div class="filtros">
    <input type="search" placeholder="Buscar por nome ou REF…" value="${esc(f.q)}" data-filtro="q">
    <select data-filtro="cat"><option value="">Todas as categorias</option>${E.dados.categorias.map((c) => `<option value="${c.id}" ${f.cat === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select>
    <select data-filtro="status"><option value="">Todos</option>${[['destaques', 'Destaques'], ['novidades', 'Novidades'], ['esgotados', 'Esgotados'], ['ocultos', 'Ocultos'], ['baixa', 'Fotos em baixa resolução']].map(([v, n]) => `<option value="${v}" ${f.status === v ? 'selected' : ''}>${n}</option>`).join('')}</select>
  </div>
  ${filtrando ? '' : '<p class="ajuda">A ordem desta lista é a ordem em que os produtos aparecem no site. Use ↑ ↓ ou arraste para mudar.</p>'}
  <div class="lista" data-lista-produtos>${lista.map(({ p, i }) => `<div class="linha-prod${p.visivel ? '' : ' oculto'}" ${filtrando ? '' : `draggable="true" data-arrastar="${i}"`}>
    <div class="ordem">${filtrando ? '' : `<button data-acao="prod-mover" data-i="${i}" data-d="-1" aria-label="Subir ${esc(p.nome)}" ${i === 0 ? 'disabled' : ''}>↑</button><button data-acao="prod-mover" data-i="${i}" data-d="1" aria-label="Descer ${esc(p.nome)}" ${i === total - 1 ? 'disabled' : ''}>↓</button>`}</div>
    <a href="#/produto/${encodeURIComponent(p.id)}">${imgFoto(p.fotos[0], 400, p.nome)}</a>
    <div class="info"><h3><a href="#/produto/${encodeURIComponent(p.id)}" style="color:inherit;text-decoration:none">${esc(p.nome || '(sem nome)')}</a></h3>
      <p>REF ${esc(p.ref)} · ${esc(catNome(p.categoria))} · <b>${dinheiro(p.preco)}</b> ${esc(p.unidade ? '/ ' + p.unidade : '')} · ${p.fotos.length} foto(s)</p>
      <div class="etiquetas">
        <button class="etq" aria-pressed="${p.visivel}" data-acao="alternar" data-id="${p.id}" data-k="visivel">${p.visivel ? 'Visível' : 'Oculto'}</button>
        <button class="etq" aria-pressed="${des.has(p.id)}" data-acao="alternar" data-id="${p.id}" data-k="destaque">Destaque</button>
        <button class="etq" aria-pressed="${nov.has(p.id)}" data-acao="alternar" data-id="${p.id}" data-k="novidade">Novidade</button>
        <button class="etq alerta" aria-pressed="${p.esgotado}" data-acao="alternar" data-id="${p.id}" data-k="esgotado">Esgotado</button>
      </div></div>
    <a class="btn btn-peq" href="#/produto/${encodeURIComponent(p.id)}">Editar</a>
  </div>`).join('') || '<p class="vazio">Nenhum produto encontrado.</p>'}</div>` };
}

function alternar(p, k) {
  if (k === 'destaque' || k === 'novidade') {
    const l = listaDe(`secao:${k === 'destaque' ? 'destaques' : 'novidades'}`);
    const i = l.indexOf(p.id);
    if (i > -1) l.splice(i, 1); else l.push(p.id);
  } else p[k] = !p[k];
  marcarSujo();
}

function telaProduto(id) {
  const p = produto(id);
  if (!p) return { titulo: 'Produto', html: '<p class="vazio">Produto não encontrado. Ele pode ter ido para a lixeira.</p><a class="btn" href="#/produtos">Voltar</a>' };
  const nov = (secao('novidades')?.produtos || []).includes(p.id), des = (secao('destaques')?.produtos || []).includes(p.id);
  const A = `produto:${p.id}`;
  return { titulo: p.nome || 'Novo produto', html: `
  <p><a href="#/produtos">← Voltar para a lista</a></p>
  <div class="cartao"><h2>Informações</h2>
    ${campo(A, 'nome', 'Nome do produto', p.nome, { ph: 'Ex.: Laço Encanto', attrs: 'maxlength="90" required' })}
    <div class="grade-2">
      <label class="campo"><span>Preço (R$)</span><input type="text" inputmode="decimal" data-alvo="${A}" data-campo="preco" data-tipo="preco" value="${precoBR(p.preco)}" placeholder="0,00"></label>
      ${campo(A, 'unidade', 'Vendido por', p.unidade, { ph: 'unidade, par, kit com 3, dúzia…', ajuda: 'Aparece depois do preço: “R$ 5,00 / unidade”.' })}
    </div>
    <div class="grade-2">
      <label class="campo"><span>Categoria</span><select data-alvo="${A}" data-campo="categoria">${E.dados.categorias.map((c) => `<option value="${c.id}" ${p.categoria === c.id ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}</select></label>
      <label class="campo"><span>Código (REF)</span><input type="text" data-alvo="${A}" data-campo="ref" value="${esc(p.ref)}" maxlength="12"><small>Vai junto na mensagem do pedido.</small></label>
    </div>
    ${campo(A, 'descricao', 'Descrição (opcional)', p.descricao, { tipo: 'textarea', ph: 'Material, tamanho, cores disponíveis, quantidade no kit…' })}
  </div>
  <div class="cartao"><h2>Fotos</h2><p class="ajuda">A primeira foto é a capa. Envie quantas quiser (JPG ou PNG). O original fica guardado e o site usa versões leves automaticamente.</p>
    <div class="fotos">${p.fotos.map((f, i) => `<div class="foto${i === 0 ? ' capa' : ''}" draggable="true" data-arrastar-foto="${i}">${imgFoto(f, 400)}
      ${i === 0 ? '<span class="selo-capa">Capa</span>' : ''}${Math.max(f.w, f.h) < 800 ? '<span class="baixa" title="Foto pequena: troque por uma maior quando puder">baixa resolução</span>' : ''}
      <div class="acoes-foto"><button data-acao="foto-mover" data-i="${i}" data-d="-1" aria-label="Mover para a esquerda" ${i === 0 ? 'disabled' : ''}>←</button>${i ? `<button class="btn-capa" data-acao="foto-capa" data-i="${i}">Capa</button>` : ''}<button data-acao="foto-remover" data-i="${i}" aria-label="Remover foto">🗑</button><button data-acao="foto-mover" data-i="${i}" data-d="1" aria-label="Mover para a direita" ${i === p.fotos.length - 1 ? 'disabled' : ''}>→</button></div></div>`).join('')}
      <label class="enviar-foto"><span class="mais">＋</span>Adicionar fotos<input type="file" accept="image/*" multiple data-enviar-fotos="${p.id}"></label></div>
  </div>
  <div class="cartao"><h2>Exibição</h2>
    ${sw(A, 'visivel', 'Visível no catálogo', p.visivel, 'Desligado: o produto fica guardado, mas os clientes não veem.')}
    <label class="sw"><input type="checkbox" data-acao-check="destaque" data-id="${p.id}" ${des ? 'checked' : ''}><span class="trilho"></span><span>Destacar na página inicial</span></label>
    <label class="sw"><input type="checkbox" data-acao-check="novidade" data-id="${p.id}" ${nov ? 'checked' : ''}><span class="trilho"></span><span>Mostrar em Novidades</span></label>
    ${sw(A, 'esgotado', 'Esgotado', p.esgotado, 'Continua aparecendo no fim da lista, mas não pode ser adicionado ao pedido.')}
  </div>
  <div class="cartao"><h2>Campanhas</h2><p class="ajuda">Marque para o produto aparecer na área especial da campanha.</p>
    ${E.dados.campanhas.map((c) => `<label class="sw"><input type="checkbox" data-acao-check="campanha" data-id="${p.id}" data-campanha="${c.id}" ${c.produtos.includes(p.id) ? 'checked' : ''}><span class="trilho"></span><span>${esc(c.nome)}</span></label>`).join('')}
    ${sw(A, 'somenteCampanha', 'Só aparece durante as campanhas marcadas', p.somenteCampanha, 'Ideal para produtos de Natal e Réveillon: somem sozinhos quando a campanha termina (e continuam guardados).')}
  </div>
  <div class="linha-botoes" style="justify-content:space-between">
    <button class="btn btn-perigo" data-acao="excluir-produto" data-id="${p.id}">🗑 Excluir produto</button>
    <span class="linha-botoes"><button class="btn" data-acao="duplicar-produto" data-id="${p.id}">Duplicar</button>${p.visivel && p.slug ? `<a class="btn" href="../produto/${esc(p.slug)}/" target="_blank">Ver no site ↗</a>` : ''}<a class="btn btn-p" href="#/produtos">Concluir</a></span>
  </div>` };
}

function proximaRef() {
  const nums = [...E.dados.produtos, ...(E.dados.lixeira || [])].map((p) => parseInt(p.ref, 10)).filter(Number.isFinite);
  return String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, '0');
}
function slugUnico(nome, ignorar) {
  const base = slugify(nome) || 'produto';
  const usados = new Set([...E.dados.produtos, ...(E.dados.lixeira || [])].filter((p) => p.id !== ignorar).map((p) => p.slug));
  let s = base, n = 2;
  while (usados.has(s)) s = `${base}-${n++}`;
  return s;
}

async function enviarFotos(listaArquivos, destino) {
  const arquivos = [...listaArquivos];
  const resultado = [];
  for (let i = 0; i < arquivos.length; i++) {
    toast(`Preparando foto ${i + 1} de ${arquivos.length}…`);
    try {
      const { foto, arquivos: arqs } = await processarFoto(arquivos[i]);
      for (const a of arqs) E.pendentes.set(a.caminho, a.blob);
      const media = arqs.find((a) => a.tamanho === 800);
      E.previas.set(foto.id, URL.createObjectURL(media.blob));
      resultado.push(foto);
    } catch (e) { modal({ titulo: 'Foto não enviada', corpo: `<p>${esc(e.message)}</p>`, botoes: [{ texto: 'Ok', primario: true }] }); }
  }
  if (resultado.length) { destino(resultado); marcarSujo(); toast(`${resultado.length} foto(s) adicionada(s). Lembre de publicar.`); }
  E.manterRolagem = true; render();
}

/* ---------- Categorias ---------- */
function telaCategorias() {
  const cats = E.dados.categorias;
  return { titulo: 'Categorias', html: `
  <p><a href="#/produtos">← Produtos</a></p>
  <div class="titulo-pagina"><div><h2>Categorias</h2><p>A ordem aqui é a ordem dos botões de filtro no site.</p></div><button class="btn btn-p" data-acao="nova-categoria">＋ Nova categoria</button></div>
  <div class="lista">${cats.map((c, i) => {
    const n = E.dados.produtos.filter((p) => p.categoria === c.id).length;
    return `<div class="linha-prod" style="grid-template-columns:auto 1fr auto">
      <div class="ordem"><button data-acao="cat-mover" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} aria-label="Subir">↑</button><button data-acao="cat-mover" data-i="${i}" data-d="1" ${i === cats.length - 1 ? 'disabled' : ''} aria-label="Descer">↓</button></div>
      <div><input type="text" data-alvo="categoria:${c.id}" data-campo="nome" value="${esc(c.nome)}" aria-label="Nome da categoria"><div class="etiquetas"><span class="etq">${n} produto(s)</span><button class="etq" aria-pressed="${c.visivel}" data-acao="cat-visivel" data-id="${c.id}">${c.visivel ? 'Visível' : 'Oculta'}</button></div></div>
      <button class="btn btn-ico btn-perigo" data-acao="excluir-categoria" data-id="${c.id}" aria-label="Excluir categoria">🗑</button></div>`;
  }).join('')}</div>` };
}

/* ---------- Página inicial ---------- */
const NOMES_SECAO = { campanha: 'Área da campanha ativa', banners: 'Banners', novidades: 'Novidades', destaques: 'Destaques', categorias: 'Compre por categoria', todos: 'Todos os produtos', comoComprar: 'Como comprar' };
function telaInicio() {
  const h = E.dados.inicio.hero;
  const secoes = E.dados.inicio.secoes;
  return { titulo: 'Página inicial', html: `
  <div class="titulo-pagina"><div><h2>Página inicial</h2><p>Textos de apresentação, banners e a ordem das seções.</p></div><a class="btn" href="../" target="_blank">Ver site ↗</a></div>
  <div class="cartao"><h2>Apresentação (topo da página)</h2><p class="ajuda">Quando uma campanha está no ar, o topo mostra a apresentação da campanha.</p>
    ${sw('hero', 'ativo', 'Mostrar apresentação', h.ativo)}
    <div class="grade-2">${campo('hero', 'selo', 'Texto pequeno acima do título', h.selo)}${campo('hero', 'botao', 'Texto do botão', h.botao)}</div>
    ${campo('hero', 'titulo', 'Título', h.titulo, { ajuda: 'Se tiver duas frases, a segunda aparece em letra elegante (itálico).' })}
    ${campo('hero', 'texto', 'Texto', h.texto, { tipo: 'textarea' })}
    <p class="campo"><span><b>Fotos da apresentação</b></span></p>
    <div class="fotos">${(h.imagens || []).map((f, i) => `<div class="foto">${imgFoto(f, 400)}<div class="acoes-foto"><span></span><button data-acao="hero-tirar" data-i="${i}" aria-label="Tirar foto">✕</button></div></div>`).join('')}
      ${(h.imagens || []).length < 3 ? '<button class="enviar-foto" data-acao="hero-escolher"><span class="mais">＋</span>Escolher fotos dos produtos</button>' : ''}</div>
    <p class="ajuda">${(h.imagens || []).length ? '' : 'Automático: usando as fotos dos destaques e novidades. '}Até 3 fotos.</p>
  </div>
  <div class="cartao"><h2>Banners</h2><p class="ajuda">Imagens de divulgação que aparecem na página inicial (formato horizontal, ex.: 1600 × 700). Deslizam lado a lado se houver mais de um.</p>
    ${(E.dados.inicio.banners || []).map((b, i, arr) => `<details class="dobra" ${b._aberto ? 'open' : ''}><summary>${esc(b.titulo || `Banner ${i + 1}`)} ${b.ativo ? '' : '(desligado)'}</summary><div>
      <div class="fotos" style="grid-template-columns:1fr">${b.imagem ? `<div class="foto" style="aspect-ratio:16/7">${imgFoto(b.imagem, 800)}</div>` : ''}<label class="enviar-foto" style="aspect-ratio:auto;padding:16px">${b.imagem ? 'Trocar imagem' : '＋ Enviar imagem do banner'}<input type="file" accept="image/*" data-enviar-banner="${b.id}"></label></div>
      ${sw(`banner:${b.id}`, 'ativo', 'Banner ligado', b.ativo)}
      <div class="grade-2">${campo(`banner:${b.id}`, 'titulo', 'Título (opcional)', b.titulo)}${campo(`banner:${b.id}`, 'botao', 'Texto do botão (opcional)', b.botao)}</div>
      ${campo(`banner:${b.id}`, 'texto', 'Texto (opcional)', b.texto)}
      ${campo(`banner:${b.id}`, 'link', 'Ao tocar, levar para…', b.link, { ph: '#produtos', ajuda: 'Use #produtos (lista), #novidades, #campanha, um link de produto (copie do site) ou um endereço https://.' })}
      <div class="linha-botoes"><button class="btn btn-peq" data-acao="banner-mover" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑ Subir</button><button class="btn btn-peq" data-acao="banner-mover" data-i="${i}" data-d="1" ${i === arr.length - 1 ? 'disabled' : ''}>↓ Descer</button><button class="btn btn-peq btn-perigo" data-acao="banner-excluir" data-i="${i}">Excluir banner</button></div>
    </div></details>`).join('') || '<p class="vazio">Nenhum banner ainda.</p>'}
    <p><button class="btn" data-acao="banner-novo">＋ Novo banner</button></p>
  </div>
  <div class="cartao"><h2>Seções da página</h2><p class="ajuda">Ligue, desligue e mude a ordem. Os produtos de Novidades e Destaques são escolhidos aqui ou na tela de cada produto.</p>
    ${secoes.map((s, i) => `<details class="dobra"><summary><span>${i + 1}. ${NOMES_SECAO[s.tipo] || s.tipo} ${s.ativo ? '' : '<small class="ajuda">(desligada)</small>'}</span></summary><div>
      ${sw(`secao:${s.tipo}`, 'ativo', 'Seção ligada', s.ativo, '', true)}
      ${'titulo' in s ? `<div class="grade-2">${campo(`secao:${s.tipo}`, 'titulo', 'Título', s.titulo)}${campo(`secao:${s.tipo}`, 'subtitulo', 'Texto pequeno acima do título', s.subtitulo)}</div>` : ''}
      ${'limite' in s ? `<label class="campo" style="max-width:220px"><span>Quantidade máxima exibida</span><input type="number" min="1" max="40" data-alvo="secao:${s.tipo}" data-campo="limite" value="${s.limite}"></label>${gerenciadorLista(`secao:${s.tipo}`)}` : ''}
      <div class="linha-botoes" style="margin-top:8px"><button class="btn btn-peq" data-acao="secao-mover" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>↑ Subir seção</button><button class="btn btn-peq" data-acao="secao-mover" data-i="${i}" data-d="1" ${i === secoes.length - 1 ? 'disabled' : ''}>↓ Descer seção</button></div>
    </div></details>`).join('')}
  </div>` };
}

/* ---------- Campanhas ---------- */
function statusCampanha(c) {
  const hoje = hojeBR();
  if (E.dados.aparencia.forcarNormal) return ['', 'Desligada (aparência normal forçada)'];
  if (c.estado === 'ligada') return ['no-ar', 'No ar agora'];
  if (c.estado === 'programada') {
    if (campanhaNoAr(c, hoje)) return ['no-ar', `No ar até ${diaBR(c.fim)}`];
    if (c.inicio && c.inicio > hoje) return ['agendada', `Programada: ${diaBR(c.inicio)} a ${diaBR(c.fim)}`];
    return ['', `Programação encerrada em ${diaBR(c.fim)}`];
  }
  return ['', 'Desligada'];
}
function aparenciaAgora() {
  if (E.dados.aparencia.forcarNormal) return null;
  return E.dados.campanhas.find((c) => campanhaNoAr(c));
}
function telaCampanhas() {
  const agora = aparenciaAgora();
  return { titulo: 'Campanhas e aparência', html: `
  <div class="titulo-pagina"><div><h2>Campanhas e aparência do site</h2><p>Ligue, desligue ou programe as decorações. Produtos, categorias e destaques nunca são apagados.</p></div><button class="btn" data-acao="nova-campanha">＋ Nova campanha</button></div>
  <div class="agora"><span class="amostra ${agora ? esc(agora.tema) : 'padrao'}"></span><div><small class="ajuda">Aparência do site hoje (${diaBR(hojeBR())})</small><br><strong>${agora ? `Campanha: ${esc(agora.nome)}` : 'Normal (sem decoração)'}</strong></div></div>
  <div class="cartao">${sw('aparencia', 'forcarNormal', 'Forçar aparência normal', E.dados.aparencia.forcarNormal, 'Desliga todas as campanhas de uma vez, sem mexer nas configurações delas.', true)}</div>
  ${E.dados.campanhas.map((c, i, arr) => {
    const [cls, txt] = statusCampanha(c);
    return `<div class="cartao"><div class="camp-topo"><h2><span class="amostra ${esc(c.tema)}"></span>${esc(c.nome)}</h2><span class="status ${cls}">${txt}</span></div>
      <p class="ajuda" style="margin:8px 0">${c.produtos.length} produto(s) na campanha · ${c.musica?.ativa ? 'com música' : 'sem música'} · prioridade ${i + 1}</p>
      <div class="linha-botoes"><a class="btn btn-p" href="#/campanha/${encodeURIComponent(c.id)}">Configurar</a>
        ${c.estado === 'ligada' ? `<button class="btn" data-acao="camp-estado" data-id="${c.id}" data-v="desligada">Desligar agora</button>` : `<button class="btn" data-acao="camp-estado" data-id="${c.id}" data-v="ligada">Ligar agora</button>`}
        <button class="btn btn-ico" data-acao="camp-mover" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''} title="Mais prioridade">↑</button><button class="btn btn-ico" data-acao="camp-mover" data-i="${i}" data-d="1" ${i === arr.length - 1 ? 'disabled' : ''} title="Menos prioridade">↓</button></div></div>`;
  }).join('')}
  <p class="ajuda">Se duas campanhas estiverem no ar ao mesmo tempo, o site usa a decoração da que estiver mais acima (maior prioridade).</p>` };
}

function telaCampanha(id) {
  const c = campanha(id);
  if (!c) return { titulo: 'Campanha', html: '<p class="vazio">Campanha não encontrada.</p>' };
  const A = `campanha:${c.id}`;
  const [cls, txt] = statusCampanha(c);
  const m = c.musica ||= { ativa: false, fonte: 'sintetizada', arquivo: null, volume: 0.4 };
  const nomeMusica = c.tema === 'reveillon' ? 'Trilha festiva original de Réveillon' : c.tema === 'natal' ? 'Jingle Bells (melodia de domínio público, versão própria)' : 'Jingle Bells (melodia de domínio público, versão própria)';
  return { titulo: c.nome, html: `
  <p><a href="#/campanhas">← Campanhas</a></p>
  <div class="cartao"><div class="camp-topo"><h2><span class="amostra ${esc(c.tema)}"></span>${esc(c.nome)}</h2><span class="status ${cls}">${txt}</span></div>
    <div class="opcoes-estado">
      ${[['desligada', 'Desligada', 'O site fica normal'], ['ligada', 'Ligada agora', 'Até você desligar'], ['programada', 'Programada', 'Liga e desliga sozinha nas datas']].map(([v, t, s]) => `<label class="opcao"><input type="radio" name="estado-${c.id}" value="${v}" data-alvo="${A}" data-campo="estado" data-rerender ${c.estado === v ? 'checked' : ''}><span><b>${t}</b><small>${s}</small></span></label>`).join('')}
    </div>
    ${c.estado === 'programada' ? `<div class="grade-2">${campo(A, 'inicio', 'Começa em', c.inicio, { tipo: 'date', attrs: 'data-rerender' })}${campo(A, 'fim', 'Termina em (inclusive)', c.fim, { tipo: 'date', attrs: 'data-rerender' })}</div>` : ''}
    <div class="linha-botoes"><a class="btn" href="../?previa=${encodeURIComponent(c.id)}" target="_blank">👁 Ver prévia no site ↗</a><span class="ajuda">A prévia mostra a última versão publicada.</span></div>
  </div>
  <div class="cartao"><h2>Textos e banner</h2>
    <div class="grade-2">${campo(A, 'nome', 'Nome da campanha', c.nome)}
      <label class="campo"><span>Estilo visual</span><select data-alvo="${A}" data-campo="tema" data-rerender>${[['natal', 'Natal (vermelho, verde e dourado)'], ['reveillon', 'Réveillon (branco e dourado)'], ['padrao', 'Cores normais da loja']].map(([v, n]) => `<option value="${v}" ${c.tema === v ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
    ${campo(A, 'faixaTopo', 'Faixa no topo do site', c.faixaTopo, { ph: 'Ex.: Especial de Natal • Pedido mínimo R$ 150' })}
    <div class="grade-2">${campo(A, 'banner.titulo', 'Título do banner', c.banner?.titulo)}${campo(A, 'banner.botao', 'Texto do botão', c.banner?.botao)}</div>
    ${campo(A, 'banner.texto', 'Texto do banner', c.banner?.texto, { tipo: 'textarea' })}
    <div class="grade-2">${campo(A, 'titulo', 'Título da área de produtos', c.titulo)}${campo(A, 'subtitulo', 'Subtítulo da área de produtos', c.subtitulo)}</div>
    <p class="campo"><span><b>Imagem do banner (opcional)</b></span><small>Sem imagem, o banner usa um mosaico com as fotos dos produtos da campanha.</small></p>
    <div class="fotos" style="grid-template-columns:1fr">${c.banner?.imagem ? `<div class="foto" style="aspect-ratio:16/9">${imgFoto(c.banner.imagem, 800)}<div class="acoes-foto"><span></span><button data-acao="camp-banner-tirar" data-id="${c.id}" aria-label="Tirar imagem">🗑</button></div></div>` : ''}
      <label class="enviar-foto" style="aspect-ratio:auto;padding:16px">${c.banner?.imagem ? 'Trocar imagem' : '＋ Enviar imagem'}<input type="file" accept="image/*" data-enviar-camp-banner="${c.id}"></label></div>
  </div>
  <div class="cartao"><h2>Produtos da campanha</h2><p class="ajuda">Aparecem em destaque na página inicial enquanto a campanha estiver no ar, sem esconder os outros produtos.</p>
    ${gerenciadorLista(A, { vazio: 'Nenhum produto ainda. Cadastre os produtos em Produtos e adicione aqui.', mostrarSoCampanha: true })}
  </div>
  <div class="cartao"><h2>Música</h2><p class="ajuda">Nunca toca sozinha: aparece um botão para o cliente ligar, com controle de volume.</p>
    ${sw(A, 'musica.ativa', 'Oferecer música no site', m.ativa, '', true)}
    ${m.ativa ? `<div class="opcoes-estado" style="grid-template-columns:1fr 1fr">
      <label class="opcao"><input type="radio" name="fonte-${c.id}" value="sintetizada" data-alvo="${A}" data-campo="musica.fonte" data-rerender ${m.fonte !== 'arquivo' ? 'checked' : ''}><span><b>Música da loja</b><small>${nomeMusica}</small></span></label>
      <label class="opcao"><input type="radio" name="fonte-${c.id}" value="arquivo" data-alvo="${A}" data-campo="musica.fonte" data-rerender ${m.fonte === 'arquivo' ? 'checked' : ''}><span><b>Meu arquivo de áudio</b><small>${m.arquivo ? 'Arquivo enviado ✓' : 'MP3 de até 8 MB, com licença de uso'}</small></span></label></div>
      ${m.fonte === 'arquivo' ? `<label class="btn" style="margin-bottom:12px">📁 ${m.arquivo ? 'Trocar arquivo' : 'Enviar arquivo de áudio'}<input type="file" accept="audio/*" hidden data-enviar-audio="${c.id}"></label>` : ''}
      <label class="campo" style="max-width:320px"><span>Volume inicial</span><input type="range" min="0.05" max="1" step="0.05" value="${m.volume ?? 0.4}" data-alvo="${A}" data-campo="musica.volume" data-tipo="numero"></label>
      <button class="btn" data-acao="ouvir" data-id="${c.id}">▶ Ouvir prévia</button>` : ''}
  </div>
  <div class="cartao"><h2>Efeitos visuais</h2>
    ${sw(A, 'efeitos.particulas', c.tema === 'reveillon' ? 'Brilhos dourados caindo devagar' : 'Neve caindo devagar', c.efeitos?.particulas)}
    ${sw(A, 'efeitos.luzes', c.tema === 'reveillon' ? 'Estrelas cintilando no banner' : 'Pisca-pisca e enfeites no topo', c.efeitos?.luzes ?? true)}
    <p class="ajuda">Os efeitos são leves e somem automaticamente para quem configurou o celular para “reduzir movimento”.</p>
  </div>
  <div class="linha-botoes" style="justify-content:space-between"><button class="btn btn-perigo" data-acao="excluir-campanha" data-id="${c.id}">Excluir campanha</button><a class="btn btn-p" href="#/campanhas">Concluir</a></div>` };
}

/* ---------- Configurações ---------- */
function telaAjustes() {
  const l = E.dados.loja;
  const acesso = ler(CHAVE_ACESSO);
  return { titulo: 'Configurações', html: `
  <div class="cartao"><h2>Informações da loja</h2>
    <div class="grade-2">${campo('loja', 'nome', 'Nome da loja', l.nome)}${campo('loja', 'slogan', 'Slogan', l.slogan)}</div>
    ${campo('loja', 'descricao', 'Descrição (aparece no Google e ao compartilhar o link)', l.descricao, { tipo: 'textarea' })}
    ${campo('loja', 'faixaTopo', 'Faixa no topo do site', l.faixaTopo)}
    ${campo('loja', 'rodapeTexto', 'Frase do rodapé', l.rodapeTexto)}
  </div>
  <div class="cartao"><h2>Contato e atendimento</h2>
    <div class="grade-2">${campo('loja', 'whatsapp', 'WhatsApp (com DDI e DDD)', l.whatsapp, { tipo: 'tel', ph: '5581999999999', ajuda: 'Só números: 55 + DDD + número.' })}${campo('loja', 'instagram', 'Instagram', l.instagram, { ph: 'lacosvip._', ajuda: 'Sem o @.' })}</div>
    <div class="grade-2">${campo('loja', 'atendimento', 'Horário de atendimento', l.atendimento, { ph: 'Seg. a sáb., 8h às 18h' })}${campo('loja', 'endereco', 'Endereço ou cidade (opcional)', l.endereco, { ph: 'Caruaru – PE' })}</div>
    ${l.whatsapp ? `<p><a class="btn btn-peq" href="https://wa.me/${esc(String(l.whatsapp).replace(/\D/g, ''))}" target="_blank">Testar link do WhatsApp ↗</a></p>` : ''}
  </div>
  <div class="cartao"><h2>Pedido</h2>
    <label class="campo" style="max-width:240px"><span>Pedido mínimo (R$)</span><input type="text" inputmode="decimal" data-alvo="loja" data-campo="pedidoMinimo" data-tipo="preco" value="${precoBR(l.pedidoMinimo)}"><small>Use 0 para não ter mínimo.</small></label>
    ${sw('loja', 'bloquearAbaixoDoMinimo', 'Bloquear envio abaixo do mínimo', l.bloquearAbaixoDoMinimo, 'Desligado: o cliente vê quanto falta, mas ainda consegue enviar.')}
    ${campo('loja', 'mensagemPedido', 'Primeira linha da mensagem do pedido', l.mensagemPedido)}
    ${campo('loja', 'urlSite', 'Endereço do site (para o Google)', l.urlSite, { tipo: 'url', ph: 'https://lacosvip.com.br', ajuda: 'Preencha quando tiver domínio próprio. Usado no mapa do site e nas pré-visualizações de link.' })}
  </div>
  ${E.armazem.tipo === 'github' ? `<div class="cartao"><h2>Acesso ao painel</h2>
    <p class="ajuda">Este aparelho está conectado ao repositório <b>${esc(acesso?.dono)}/${esc(acesso?.repo)}</b>.</p>
    <div class="linha-botoes"><button class="btn" data-acao="copiar-link">Copiar link de acesso para outro aparelho</button><button class="btn" data-acao="trocar-chave">Trocar chave</button><button class="btn btn-perigo" data-acao="sair">Sair deste aparelho</button></div>
    <p class="ajuda">O link de acesso contém a sua chave secreta. Guarde-o só para você. Se ele vazar, apague a chave no GitHub (Settings › Developer settings › Tokens) e crie outra.</p></div>` : ''}` };
}

/* ---------- Backup ---------- */
function telaBackup() {
  const lix = E.dados.lixeira || [];
  return { titulo: 'Backup e recuperação', html: `
  <div class="cartao"><h2>Lixeira</h2><p class="ajuda">Produtos excluídos ficam aqui até você apagar de vez.</p>
    <div class="lista">${lix.map((p, i) => `<div class="linha-prod" style="grid-template-columns:56px 1fr auto">${imgFoto(p.fotos[0])}<div class="info"><h3>${esc(p.nome)}</h3><p>REF ${esc(p.ref)} · excluído em ${dataBR(p.excluidoEm)}</p></div>
      <div class="linha-botoes"><button class="btn btn-peq" data-acao="restaurar-produto" data-i="${i}">Restaurar</button><button class="btn btn-peq btn-perigo" data-acao="apagar-de-vez" data-i="${i}">Apagar de vez</button></div></div>`).join('') || '<p class="vazio">A lixeira está vazia.</p>'}</div></div>
  <div class="cartao"><h2>Histórico de versões</h2><p class="ajuda">Cada publicação fica guardada. Você pode voltar o catálogo inteiro para uma versão anterior.</p>
    <div class="tabela-hist" data-historico><p class="vazio">Carregando histórico…</p></div></div>
  <div class="cartao"><h2>Cópia de segurança</h2>
    <p class="ajuda">Baixe uma cópia dos dados do catálogo (produtos, preços, campanhas e configurações). As fotos ficam guardadas no seu repositório.</p>
    <div class="linha-botoes"><button class="btn btn-p" data-acao="baixar-backup">⬇ Baixar dados do catálogo</button>
      ${E.armazem.urlBackupCompleto() ? `<a class="btn" href="${E.armazem.urlBackupCompleto()}">⬇ Baixar tudo com fotos (.zip)</a>` : ''}
      <label class="btn">⬆ Restaurar de um arquivo<input type="file" accept="application/json,.json" hidden data-restaurar-arquivo></label></div>
  </div>` };
}
async function carregarHistorico() {
  const caixa = $('[data-historico]');
  if (!caixa) return;
  try {
    const lista = await E.armazem.historico();
    caixa.innerHTML = lista.map((h, i) => `<div class="hist"><p>${esc(h.mensagem)}<br><small>${dataBR(h.data)}${i === 0 ? ' · versão atual' : ''}</small></p>${i === 0 ? '' : `<button class="btn btn-peq" data-acao="voltar-versao" data-id="${h.id}" data-data="${esc(h.data)}">Voltar para esta</button>`}</div>`).join('') || '<p class="vazio">Sem histórico ainda.</p>';
  } catch (e) { caixa.innerHTML = `<p class="alerta-caixa erro">Não consegui carregar o histórico: ${esc(e.message)}</p>`; }
}

function baixarBackup() {
  sincronizar();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(E.dados, null, 2)], { type: 'application/json' }));
  a.download = `lacos-vip-backup-${hojeBR()}.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return true;
}

/* ------------------------------------------------------------------ ações */
const acoes = {
  publicar, descartar: async () => { if (await confirmar('Descartar alterações?', 'Tudo o que você mudou desde a última publicação será desfeito.', 'Descartar', true)) { localStorage.removeItem('lvip-rascunho'); E.dados = clonar(E.original); E.pendentes.clear(); E.recuperarDe = null; E.sujo = false; render(); } },
  'novo-produto': () => {
    const p = { id: novoIdProduto(), ref: proximaRef(), nome: '', slug: '', descricao: '', preco: 0, unidade: 'unidade', categoria: E.filtro.cat || E.dados.categorias[0]?.id, fotos: [], visivel: true, destaque: false, novidade: false, esgotado: false, somenteCampanha: false, criadoEm: new Date().toISOString(), _novo: true };
    E.dados.produtos.unshift(p);
    marcarSujo();
    E.focar = '[data-campo="nome"]';
    location.hash = `#/produto/${encodeURIComponent(p.id)}`;
  },
  'duplicar-produto': (b) => {
    const o = produto(b.dataset.id);
    const p = { ...clonar(o), id: novoIdProduto(), ref: proximaRef(), nome: `${o.nome} (cópia)`, criadoEm: new Date().toISOString(), _novo: true };
    p.slug = slugUnico(p.nome, p.id);
    E.dados.produtos.splice(E.dados.produtos.indexOf(o) + 1, 0, p);
    marcarSujo(); location.hash = `#/produto/${encodeURIComponent(p.id)}`; toast('Produto duplicado (as fotos são as mesmas).');
  },
  'excluir-produto': async (b) => {
    const p = produto(b.dataset.id);
    if (!await confirmar('Excluir produto?', `“${esc(p.nome || 'Sem nome')}” vai para a <b>lixeira</b> (Backup › Lixeira). Você pode restaurar depois.`, 'Mover para a lixeira', true)) return;
    const lembrar = { novidades: (secao('novidades')?.produtos || []).includes(p.id), destaques: (secao('destaques')?.produtos || []).includes(p.id), campanhas: E.dados.campanhas.filter((c) => c.produtos.includes(p.id)).map((c) => c.id), posicao: E.dados.produtos.indexOf(p) };
    E.dados.produtos.splice(lembrar.posicao, 1);
    if (p._novo && !p.fotos.length) { /* nunca publicado e vazio: some de vez */ } else (E.dados.lixeira ||= []).unshift({ ...p, excluidoEm: new Date().toISOString(), _lembrar: lembrar });
    sincronizar(); marcarSujo(); location.hash = '#/produtos'; toast('Produto movido para a lixeira.');
  },
  'restaurar-produto': (b) => {
    const [p] = E.dados.lixeira.splice(Number(b.dataset.i), 1);
    const l = p._lembrar || {};
    delete p.excluidoEm; delete p._lembrar;
    E.dados.produtos.splice(Math.min(l.posicao ?? 0, E.dados.produtos.length), 0, p);
    if (l.novidades) listaDe('secao:novidades').push(p.id);
    if (l.destaques) listaDe('secao:destaques').push(p.id);
    for (const id of l.campanhas || []) campanha(id)?.produtos.push(p.id);
    marcarSujo(); render(); toast(`“${p.nome}” restaurado.`);
  },
  'apagar-de-vez': async (b) => {
    const p = E.dados.lixeira[Number(b.dataset.i)];
    if (!await confirmar('Apagar de vez?', `“${esc(p.nome)}” e as fotos dele serão apagados do catálogo. Ainda será possível recuperar pelo <b>Histórico de versões</b>.`, 'Apagar de vez', true)) return;
    E.dados.lixeira.splice(Number(b.dataset.i), 1); marcarSujo(); render();
  },
  alternar: (b) => { alternar(produto(b.dataset.id), b.dataset.k); E.manterRolagem = true; render(); },
  'prod-mover': (b) => { moverEm(E.dados.produtos, Number(b.dataset.i), Number(b.dataset.d)); marcarSujo(); E.manterRolagem = true; render(); },
  'foto-mover': (b) => { const p = produto(rota().id); moverEm(p.fotos, Number(b.dataset.i), Number(b.dataset.d)); marcarSujo(); E.manterRolagem = true; render(); },
  'foto-capa': (b) => { const p = produto(rota().id); const [f] = p.fotos.splice(Number(b.dataset.i), 1); p.fotos.unshift(f); marcarSujo(); E.manterRolagem = true; render(); },
  'foto-remover': async (b) => { const p = produto(rota().id); if (!await confirmar('Remover foto?', 'A foto sai deste produto. Se precisar, ela pode ser recuperada pelo Histórico de versões.', 'Remover', true)) return; p.fotos.splice(Number(b.dataset.i), 1); marcarSujo(); E.manterRolagem = true; render(); },
  'nova-categoria': () => modal({ titulo: 'Nova categoria', corpo: '<label class="campo"><span>Nome</span><input type="text" data-nova-cat maxlength="40" placeholder="Ex.: Natal"></label>', botoes: [{ texto: 'Cancelar' }, { texto: 'Criar', primario: true, acao: (c) => {
    const nome = $('[data-nova-cat]', c).value.trim();
    if (!nome) return true;
    let id = slugify(nome), n = 2; while (E.dados.categorias.some((x) => x.id === id)) id = `${slugify(nome)}-${n++}`;
    E.dados.categorias.push({ id, nome, visivel: true }); marcarSujo(); render();
  } }] }),
  'cat-mover': (b) => { moverEm(E.dados.categorias, Number(b.dataset.i), Number(b.dataset.d)); marcarSujo(); render(); },
  'cat-visivel': (b) => { const c = E.dados.categorias.find((x) => x.id === b.dataset.id); c.visivel = !c.visivel; marcarSujo(); render(); },
  'excluir-categoria': (b) => {
    const c = E.dados.categorias.find((x) => x.id === b.dataset.id);
    const ps = E.dados.produtos.filter((p) => p.categoria === c.id);
    const outras = E.dados.categorias.filter((x) => x.id !== c.id);
    if (!outras.length) return toast('É preciso ter pelo menos uma categoria.');
    modal({ titulo: `Excluir “${c.nome}”?`, corpo: ps.length ? `<p>${ps.length} produto(s) estão nesta categoria. Para onde eles vão?</p><select data-mover-para>${outras.map((o) => `<option value="${o.id}">${esc(o.nome)}</option>`).join('')}</select>` : '<p>A categoria está vazia.</p>',
      botoes: [{ texto: 'Cancelar' }, { texto: 'Excluir categoria', perigo: true, acao: (cm) => { const para = $('[data-mover-para]', cm)?.value; ps.forEach((p) => { p.categoria = para; }); E.dados.categorias = outras; marcarSujo(); render(); } }] });
  },
  'lista-mover': (b) => { moverEm(listaDe(b.dataset.lista), Number(b.dataset.i), Number(b.dataset.d)); marcarSujo(); E.manterRolagem = true; render(); },
  'lista-tirar': (b) => { listaDe(b.dataset.lista).splice(Number(b.dataset.i), 1); marcarSujo(); E.manterRolagem = true; render(); },
  'lista-escolher': (b) => escolherProdutos(b.dataset.lista),
  'secao-mover': (b) => { moverEm(E.dados.inicio.secoes, Number(b.dataset.i), Number(b.dataset.d)); marcarSujo(); E.manterRolagem = true; render(); },
  'hero-tirar': (b) => { E.dados.inicio.hero.imagens.splice(Number(b.dataset.i), 1); marcarSujo(); E.manterRolagem = true; render(); },
  'hero-escolher': () => {
    const fotos = E.dados.produtos.flatMap((p) => p.fotos.map((f) => ({ f, p })));
    modal({ titulo: 'Escolher fotos (até 3)', corpo: `<div class="fotos">${fotos.map(({ f, p }, i) => `<label class="foto" title="${esc(p.nome)}">${imgFoto(f)}<input type="checkbox" value="${i}" style="position:absolute;top:8px;left:8px;width:22px;height:22px;accent-color:#861D47"></label>`).join('')}</div>`,
      botoes: [{ texto: 'Cancelar' }, { texto: 'Usar fotos', primario: true, acao: (c) => {
        const esc3 = $$('input:checked', c).slice(0, 3).map((i) => fotos[Number(i.value)].f);
        const h = E.dados.inicio.hero; h.imagens = [...(h.imagens || []), ...esc3].slice(0, 3); marcarSujo(); render();
      } }] });
  },
  'banner-novo': () => { const b = { id: `b${Date.now().toString(36)}`, ativo: true, titulo: '', texto: '', botao: '', link: '#produtos', imagem: null, _aberto: true }; (E.dados.inicio.banners ||= []).push(b); marcarSujo(); E.manterRolagem = true; render(); },
  'banner-mover': (b) => { moverEm(E.dados.inicio.banners, Number(b.dataset.i), Number(b.dataset.d)); marcarSujo(); E.manterRolagem = true; render(); },
  'banner-excluir': async (b) => { if (await confirmar('Excluir banner?', 'O banner sai da página inicial.', 'Excluir', true)) { E.dados.inicio.banners.splice(Number(b.dataset.i), 1); marcarSujo(); render(); } },
  'camp-estado': (b) => { campanha(b.dataset.id).estado = b.dataset.v; marcarSujo(); render(); toast(b.dataset.v === 'ligada' ? 'Campanha ligada. Publique para aplicar no site.' : 'Campanha desligada. Publique para aplicar no site.'); },
  'camp-mover': (b) => { moverEm(E.dados.campanhas, Number(b.dataset.i), Number(b.dataset.d)); marcarSujo(); render(); },
  'camp-banner-tirar': (b) => { campanha(b.dataset.id).banner.imagem = null; marcarSujo(); E.manterRolagem = true; render(); },
  'nova-campanha': () => modal({ titulo: 'Nova campanha', corpo: '<label class="campo"><span>Nome</span><input type="text" data-nc-nome placeholder="Ex.: Dia das Mães" maxlength="40"></label><label class="campo"><span>Estilo visual</span><select data-nc-tema><option value="padrao">Cores normais da loja</option><option value="natal">Natal</option><option value="reveillon">Réveillon</option></select></label>',
    botoes: [{ texto: 'Cancelar' }, { texto: 'Criar', primario: true, acao: (c) => {
      const nome = $('[data-nc-nome]', c).value.trim(); if (!nome) return true;
      let id = slugify(nome), n = 2; while (campanha(id)) id = `${slugify(nome)}-${n++}`;
      E.dados.campanhas.push({ id, nome, tema: $('[data-nc-tema]', c).value, estado: 'desligada', inicio: '', fim: '', titulo: nome, subtitulo: '', faixaTopo: '', banner: { titulo: nome, texto: '', botao: 'Ver produtos', imagem: null }, produtos: [], musica: { ativa: false, fonte: 'sintetizada', arquivo: null, volume: 0.4 }, efeitos: { particulas: false, luzes: true } });
      marcarSujo(); location.hash = `#/campanha/${id}`;
    } }] }),
  'excluir-campanha': async (b) => { const c = campanha(b.dataset.id); if (await confirmar('Excluir campanha?', `A campanha “${esc(c.nome)}” será removida. Os produtos dela <b>não</b> são apagados.`, 'Excluir', true)) { E.dados.campanhas = E.dados.campanhas.filter((x) => x !== c); marcarSujo(); location.hash = '#/campanhas'; } },
  ouvir: async (b) => {
    const c = campanha(b.dataset.id);
    if (E.tocador) { E.tocador.parar(); E.tocador = null; b.textContent = '▶ Ouvir prévia'; return; }
    const { criarPlayer } = await import('../js/musica.js');
    let cc = c;
    const caminho = c.musica.arquivo && `audio/${c.musica.arquivo}`;
    if (c.musica.fonte === 'arquivo' && caminho && E.pendentes.has(caminho)) cc = { ...c, musica: { ...c.musica, fonte: 'url' } };
    E.tocador = cc.musica.fonte === 'url' ? { el: new Audio(URL.createObjectURL(E.pendentes.get(caminho))), iniciar() { this.el.volume = c.musica.volume; return this.el.play(); }, parar() { this.el.pause(); } } : criarPlayer(c, BASE);
    E.tocador.definirVolume?.(c.musica.volume ?? 0.4);
    try { await E.tocador.iniciar(); b.textContent = '⏸ Parar prévia'; } catch { toast('Não foi possível tocar. Se você enviou um arquivo, publique primeiro.'); E.tocador = null; }
  },
  'baixar-backup': baixarBackup,
  'voltar-versao': async (b) => {
    if (!await confirmar('Voltar para esta versão?', `O catálogo inteiro (produtos, preços, campanhas e configurações) volta a ser como estava em <b>${dataBR(b.dataset.data)}</b>. Fotos apagadas depois disso também voltam. Nada muda no site até você apertar <b>Publicar</b>.`, 'Carregar esta versão')) return;
    try { E.dados = normalizar(await E.armazem.lerVersao(b.dataset.id)); E.recuperarDe = b.dataset.id; marcarSujo(); location.hash = '#/produtos'; render(); toast('Versão carregada. Confira e publique.'); } catch (e) { toast(e.message); }
  },
  'copiar-link': async () => { const a = ler(CHAVE_ACESSO); const url = `${location.origin}${location.pathname}#chave=${a.chave}`; try { await navigator.clipboard.writeText(url); toast('Link copiado. Abra no outro aparelho e guarde nos favoritos.'); } catch { modal({ titulo: 'Seu link de acesso', corpo: `<input type="text" readonly value="${esc(url)}">`, botoes: [{ texto: 'Ok', primario: true }] }); } },
  'trocar-chave': () => telaEntrada(true),
  sair: async () => { if (await confirmar('Sair deste aparelho?', 'A chave de acesso será apagada deste aparelho. Para entrar de novo você vai precisar do link de acesso ou da chave.', 'Sair', true)) { localStorage.removeItem(CHAVE_ACESSO); location.reload(); } },
};
function moverEm(arr, i, d) { const j = i + d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; }

/* ------------------------------------------------------------------ eventos */
document.addEventListener('click', (e) => {
  const b = e.target.closest('[data-acao]');
  if (!b || b.disabled) return;
  e.preventDefault();
  acoes[b.dataset.acao]?.(b);
});

function aplicarCampo(el) {
  const obj = alvo(el.dataset.alvo);
  if (!obj) return;
  let v;
  if (el.type === 'checkbox') v = el.checked;
  else if (el.type === 'radio') { if (!el.checked) return; v = el.value; }
  else if (el.dataset.tipo === 'preco') v = lerPreco(el.value);
  else if (el.dataset.tipo === 'numero' || el.type === 'number' || el.type === 'range') v = Number(el.value);
  else v = el.value;
  setar(obj, el.dataset.campo, v);
  if (el.dataset.alvo.startsWith('produto:') && el.dataset.campo === 'nome' && obj._novo) obj.slug = slugUnico(v, obj.id);
  if (el.dataset.alvo.startsWith('produto:') && el.dataset.campo === 'nome') { const h = $('.topo h1'); if (h) h.textContent = v || 'Novo produto'; }
  marcarSujo();
}
document.addEventListener('input', (e) => {
  const el = e.target;
  if (el.dataset.filtro) { E.filtro[el.dataset.filtro] = el.value; const pos = el.selectionStart; render(); const novo = $(`[data-filtro="${el.dataset.filtro}"]`); novo.focus(); if (pos != null && novo.setSelectionRange) novo.setSelectionRange(pos, pos); return; }
  if (el.dataset.alvo && el.type !== 'checkbox' && el.type !== 'radio' && el.tagName !== 'SELECT' && el.dataset.tipo !== 'preco') aplicarCampo(el);
});
document.addEventListener('change', async (e) => {
  const el = e.target;
  if (el.dataset.filtro) return;
  if (el.dataset.alvo) { aplicarCampo(el); if (el.type === 'checkbox' || el.type === 'radio' || el.tagName === 'SELECT' || 'rerender' in el.dataset) { E.manterRolagem = true; render(); } return; }
  if (el.dataset.acaoCheck) {
    const p = produto(el.dataset.id);
    if (el.dataset.acaoCheck === 'campanha') { const l = campanha(el.dataset.campanha).produtos; const i = l.indexOf(p.id); if (el.checked && i < 0) l.push(p.id); if (!el.checked && i > -1) l.splice(i, 1); marcarSujo(); }
    else alternar(p, el.dataset.acaoCheck);
    return;
  }
  if (el.dataset.enviarFotos) { const p = produto(el.dataset.enviarFotos); await enviarFotos(el.files, (fs) => p.fotos.push(...fs)); return; }
  if (el.dataset.enviarBanner) { const b = E.dados.inicio.banners.find((x) => x.id === el.dataset.enviarBanner); b._aberto = true; await enviarFotos([el.files[0]], ([f]) => { b.imagem = f; }); return; }
  if (el.dataset.enviarCampBanner) { const c = campanha(el.dataset.enviarCampBanner); await enviarFotos([el.files[0]], ([f]) => { c.banner.imagem = f; }); return; }
  if (el.dataset.enviarAudio) {
    try { const { nome, arquivos } = await processarAudio(el.files[0]); arquivos.forEach((a) => E.pendentes.set(a.caminho, a.blob)); const c = campanha(el.dataset.enviarAudio); c.musica.arquivo = nome; c.musica.fonte = 'arquivo'; marcarSujo(); render(); toast('Áudio enviado. Publique para aplicar.'); }
    catch (err) { toast(err.message); }
    return;
  }
  if ('restaurarArquivo' in el.dataset) {
    try {
      const d = normalizar(JSON.parse(await el.files[0].text()));
      if (!await confirmar('Restaurar deste arquivo?', `O arquivo tem <b>${d.produtos.length} produtos</b>. O catálogo atual será substituído por ele (nada muda no site até publicar).`, 'Restaurar')) return;
      E.dados = d; marcarSujo(); location.hash = '#/produtos'; render(); toast('Backup carregado. Confira e publique.');
    } catch { modal({ titulo: 'Arquivo inválido', corpo: '<p>Esse arquivo não parece ser um backup do catálogo Laços VIP.</p>', botoes: [{ texto: 'Ok', primario: true }] }); }
  }
});
// o preço é aplicado ao sair do campo (para permitir digitar "5,5" etc.)
document.addEventListener('focusout', (e) => { if (e.target.dataset?.tipo === 'preco' && e.target.dataset.alvo) { aplicarCampo(e.target); e.target.value = precoBR(obter(alvo(e.target.dataset.alvo), e.target.dataset.campo)); } });

// arrastar e soltar (computador)
let arrastado = null;
document.addEventListener('dragstart', (e) => { const el = e.target.closest('[data-arrastar],[data-arrastar-foto]'); if (!el) return; arrastado = el; el.classList.add('arrastando'); e.dataTransfer.effectAllowed = 'move'; });
document.addEventListener('dragover', (e) => { const el = e.target.closest('[data-arrastar],[data-arrastar-foto]'); if (!arrastado || !el || el === arrastado) return; e.preventDefault(); $$('.alvo-soltar').forEach((x) => x.classList.remove('alvo-soltar')); el.classList.add('alvo-soltar'); });
document.addEventListener('drop', (e) => {
  const el = e.target.closest('[data-arrastar],[data-arrastar-foto]');
  if (!arrastado || !el) return;
  e.preventDefault();
  const foto = 'arrastarFoto' in arrastado.dataset;
  const arr = foto ? produto(rota().id).fotos : E.dados.produtos;
  const de = Number(foto ? arrastado.dataset.arrastarFoto : arrastado.dataset.arrastar), para = Number(foto ? el.dataset.arrastarFoto : el.dataset.arrastar);
  const [x] = arr.splice(de, 1); arr.splice(para, 0, x);
  arrastado = null; marcarSujo(); E.manterRolagem = true; render();
});
document.addEventListener('dragend', () => { $$('.arrastando,.alvo-soltar').forEach((x) => x.classList.remove('arrastando', 'alvo-soltar')); arrastado = null; });

addEventListener('hashchange', () => {
  if (location.hash.startsWith('#chave=')) return;
  E.tocador?.parar(); E.tocador = null;
  render(); scrollTo(0, 0);
  if (rota().nome === 'backup') carregarHistorico();
});
addEventListener('beforeunload', (e) => { if (E.sujo || E.publicando) { e.preventDefault(); e.returnValue = ''; } });

/* ------------------------------------------------------------------ dados antigos / novos */
function normalizar(d) {
  if (!d || !Array.isArray(d.produtos) || !d.loja) throw new Error('formato inválido');
  d.lixeira ||= []; d.aparencia ||= { forcarNormal: false }; d.inicio.banners ||= [];
  for (const c of d.campanhas || []) { c.efeitos ||= { particulas: false, luzes: true }; c.musica ||= { ativa: false, fonte: 'sintetizada', arquivo: null, volume: 0.4 }; c.banner ||= {}; c.produtos ||= []; }
  return d;
}

/* ------------------------------------------------------------------ entrada / acesso */
function ler(k) { try { return JSON.parse(localStorage.getItem(k)); } catch { return null; } }
function adivinharRepositorio() {
  const h = location.hostname;
  if (!h.endsWith('.github.io')) return { dono: '', repo: '' };
  const dono = h.replace('.github.io', '');
  const primeiro = location.pathname.split('/').filter(Boolean)[0];
  return { dono, repo: primeiro && primeiro !== 'painel' ? primeiro : h };
}
function telaEntrada(trocando = false) {
  const atual = ler(CHAVE_ACESSO) || adivinharRepositorio();
  $('#app').innerHTML = `<div class="entrada">
  <div class="marca"><img src="../img/laco-sm.png" alt=""><div><h1>Painel Laços VIP</h1><p class="ajuda" style="margin:0">Conectar este aparelho</p></div></div>
  <div class="cartao"><h2>${trocando ? 'Trocar chave de acesso' : 'Primeiro acesso neste aparelho'}</h2>
    <p class="ajuda">O painel salva as mudanças direto no seu repositório do GitHub. Para isso, ele precisa de uma <b>chave de acesso</b> (feita uma única vez — o passo a passo está no manual).</p>
    <ol class="ajuda"><li>No GitHub, abra <b>Settings › Developer settings › Personal access tokens › Fine-grained tokens</b> e clique em <b>Generate new token</b>.</li>
      <li>Em <b>Repository access</b>, escolha <b>Only select repositories</b> e marque o repositório do site.</li>
      <li>Em <b>Permissions › Repository permissions › Contents</b>, escolha <b>Read and write</b>.</li>
      <li>Gere, copie a chave (começa com <code>github_pat_</code>) e cole aqui.</li></ol>
    <div class="grade-2"><label class="campo"><span>Usuário do GitHub</span><input type="text" data-e="dono" value="${esc(atual.dono || '')}" autocapitalize="off"></label><label class="campo"><span>Repositório</span><input type="text" data-e="repo" value="${esc(atual.repo || '')}" autocapitalize="off"></label></div>
    <label class="campo"><span>Chave de acesso</span><input type="password" data-e="chave" placeholder="github_pat_…" autocomplete="off"></label>
    <p class="alerta-caixa erro" data-e-erro hidden></p>
    <button class="btn btn-p" data-entrar>Conectar</button>
  </div></div>`;
  $('[data-entrar]').onclick = async () => {
    const v = (k) => $(`[data-e="${k}"]`).value.trim();
    const conf = { dono: v('dono'), repo: v('repo'), chave: v('chave') };
    const erro = $('[data-e-erro]');
    if (!conf.dono || !conf.repo || !conf.chave) { erro.hidden = false; erro.textContent = 'Preencha os três campos.'; return; }
    try { await new ArmazemGitHub(conf).testar(); localStorage.setItem(CHAVE_ACESSO, JSON.stringify(conf)); location.hash = '#/produtos'; location.reload(); }
    catch (e) { erro.hidden = false; erro.textContent = e instanceof ErroAcesso ? 'Chave recusada. Confira se copiou inteira e se deu permissão de escrita (Contents: Read and write).' : `Não consegui acessar ${conf.dono}/${conf.repo}. Confira o usuário e o nome do repositório.`; }
  };
}

async function iniciar() {
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
  // link de acesso: #chave=github_pat_...
  const m = location.hash.match(/^#chave=([\w-]+)/);
  if (m && !local) {
    const conf = { ...adivinharRepositorio(), ...(ler(CHAVE_ACESSO) || {}), chave: m[1] };
    localStorage.setItem(CHAVE_ACESSO, JSON.stringify(conf));
    history.replaceState(null, '', location.pathname + '#/produtos'); // tira a chave da barra de endereço
  }
  if (local) E.armazem = new ArmazemLocal();
  else {
    const conf = ler(CHAVE_ACESSO);
    if (!conf?.chave || !conf.dono || !conf.repo) return telaEntrada();
    E.armazem = new ArmazemGitHub(conf);
  }
  try {
    const { dados, versao } = await E.armazem.carregar();
    E.dados = normalizar(dados); E.original = clonar(E.dados); E.versao = versao;
  } catch (e) {
    if (e instanceof ErroAcesso) return telaEntrada(true);
    $('#app').innerHTML = `<div class="entrada"><p class="alerta-caixa erro">Não consegui carregar o catálogo: ${esc(e.message)}</p><button class="btn" onclick="location.reload()">Tentar de novo</button></div>`;
    return;
  }
  const rasc = ler('lvip-rascunho');
  render();
  if (rasc && rasc.versao === E.versao && JSON.stringify(rasc.dados) !== JSON.stringify(E.dados)) {
    modal({ titulo: 'Alterações não publicadas', corpo: `<p>Encontrei alterações que você fez em ${dataBR(rasc.quando)} e não publicou. Quer continuar de onde parou?</p><p class="ajuda">Fotos enviadas nessa sessão anterior precisam ser enviadas de novo.</p>`,
      botoes: [{ texto: 'Descartar', acao: () => localStorage.removeItem('lvip-rascunho') }, { texto: 'Continuar', primario: true, acao: () => {
        E.dados = normalizar(rasc.dados);
        // remove fotos que dependiam de arquivos não enviados
        const publicadas = new Set(arquivosReferenciados(E.original));
        const ok = (f) => !f || publicadas.has(`fotos/${f.id}-400.${f.ext || 'webp'}`);
        for (const p of E.dados.produtos) p.fotos = p.fotos.filter(ok);
        E.sujo = true; render();
      } }] });
  }
  if (rota().nome === 'backup') carregarHistorico();
}
iniciar();

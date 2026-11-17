// Onde o painel guarda os dados.
// - No site publicado: no repositório do GitHub (cada publicação vira uma versão no histórico).
// - No computador (localhost): no servidor de desenvolvimento (scripts/dev-server.mjs), também com histórico (git).
const CAMINHO_DADOS = 'data/catalogo.json';

const paraBase64 = (blob) => new Promise((ok, erro) => {
  const r = new FileReader();
  r.onload = () => ok(String(r.result).split(',')[1]);
  r.onerror = erro;
  r.readAsDataURL(blob);
});
const textoParaBase64 = (txt) => paraBase64(new Blob([txt], { type: 'application/json' }));
const base64ParaTexto = (b64) => new TextDecoder().decode(Uint8Array.from(atob(b64.replace(/\n/g, '')), (c) => c.charCodeAt(0)));

export class ErroConflito extends Error {}
export class ErroAcesso extends Error {}

/* ------------------------------------------------------------------ GitHub */
export class ArmazemGitHub {
  constructor({ dono, repo, ramo = 'main', chave }) {
    Object.assign(this, { dono, repo, ramo, chave });
    this.tipo = 'github';
    this.api = `https://api.github.com/repos/${dono}/${repo}`;
  }
  async req(caminho, opcoes = {}) {
    const r = await fetch(caminho.startsWith('http') ? caminho : this.api + caminho, {
      ...opcoes,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${this.chave}`, 'X-GitHub-Api-Version': '2022-11-28', ...(opcoes.body ? { 'Content-Type': 'application/json' } : {}), ...(opcoes.headers || {}) },
      cache: 'no-store',
    });
    if (r.status === 401 || r.status === 403) throw new ErroAcesso('A chave de acesso não foi aceita pelo GitHub (pode ter expirado ou estar sem permissão de escrita).');
    if (r.status === 409 || r.status === 422) {
      const t = await r.text();
      if (/fast forward|Update is not a fast forward|reference/i.test(t)) throw new ErroConflito('O catálogo foi alterado em outro aparelho.');
      throw new Error(`GitHub recusou a operação: ${t.slice(0, 200)}`);
    }
    if (!r.ok) throw new Error(`Erro ${r.status} ao falar com o GitHub.`);
    return r.status === 204 ? null : r.json();
  }
  urlArquivoBruto(caminho) { return `https://raw.githubusercontent.com/${this.dono}/${this.repo}/${this.ramo}/${caminho}`; }
  urlRepositorio() { return `https://github.com/${this.dono}/${this.repo}`; }
  async testar() { await this.req(''); return true; }

  async carregar() {
    const arq = await this.req(`/contents/${CAMINHO_DADOS}?ref=${this.ramo}`);
    let texto;
    if (arq.content) texto = base64ParaTexto(arq.content);
    else texto = base64ParaTexto((await this.req(`/git/blobs/${arq.sha}`)).content); // arquivos > 1 MB
    return { dados: JSON.parse(texto), versao: arq.sha };
  }

  async arvore(sha) { return (await this.req(`/git/trees/${sha}?recursive=1`)).tree; }

  /**
   * Publica tudo em um único "commit": dados + fotos novas + arquivos removidos.
   * versaoBase: sha do catalogo.json carregado (para não sobrescrever alterações feitas em outro aparelho).
   */
  async publicar({ dados, arquivos = [], remover = [], mensagem, versaoBase, recuperarDe = null }, progresso = () => {}) {
    const ref = await this.req(`/git/ref/heads/${this.ramo}`);
    const commitAtual = await this.req(`/git/commits/${ref.object.sha}`);
    if (versaoBase) {
      const atual = await this.req(`/contents/${CAMINHO_DADOS}?ref=${ref.object.sha}`);
      if (atual.sha !== versaoBase) throw new ErroConflito('O catálogo foi alterado em outro aparelho depois que você abriu o painel.');
    }
    const itens = [];
    let n = 0;
    for (const a of arquivos) {
      progresso(`Enviando fotos e arquivos (${++n} de ${arquivos.length})…`);
      const blob = await this.req('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await paraBase64(a.blob), encoding: 'base64' }) });
      itens.push({ path: a.caminho, mode: '100644', type: 'blob', sha: blob.sha });
    }
    // Ao restaurar uma versão antiga, recoloca fotos que tinham sido apagadas depois dela
    if (recuperarDe) {
      progresso('Recuperando fotos da versão escolhida…');
      const [antiga, atual] = await Promise.all([this.arvore(recuperarDe), this.arvore(commitAtual.tree.sha)]);
      const existentes = new Set(atual.map((x) => x.path));
      const precisa = new Set(arquivosReferenciados(dados));
      for (const x of antiga) if (x.type === 'blob' && precisa.has(x.path) && !existentes.has(x.path)) itens.push({ path: x.path, mode: '100644', type: 'blob', sha: x.sha });
    }
    for (const caminho of remover) itens.push({ path: caminho, mode: '100644', type: 'blob', sha: null });
    progresso('Salvando o catálogo…');
    const dadosBlob = await this.req('/git/blobs', { method: 'POST', body: JSON.stringify({ content: await textoParaBase64(JSON.stringify(dados, null, 2)), encoding: 'base64' }) });
    itens.push({ path: CAMINHO_DADOS, mode: '100644', type: 'blob', sha: dadosBlob.sha });
    // remoções de arquivos que não existem quebram a árvore: filtra
    let arvoreItens = itens;
    if (remover.length) {
      const existentes = new Set((await this.arvore(commitAtual.tree.sha)).map((x) => x.path));
      arvoreItens = itens.filter((x) => x.sha !== null || existentes.has(x.path));
    }
    const arvore = await this.req('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: commitAtual.tree.sha, tree: arvoreItens }) });
    const commit = await this.req('/git/commits', { method: 'POST', body: JSON.stringify({ message: mensagem, tree: arvore.sha, parents: [ref.object.sha] }) });
    await this.req(`/git/refs/heads/${this.ramo}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
    return { versao: dadosBlob.sha };
  }

  async historico() {
    const lista = await this.req(`/commits?path=${CAMINHO_DADOS}&sha=${this.ramo}&per_page=40`);
    return lista.map((c) => ({ id: c.sha, data: c.commit.author.date, mensagem: c.commit.message }));
  }
  async lerVersao(id) {
    const arq = await this.req(`/contents/${CAMINHO_DADOS}?ref=${id}`);
    const texto = arq.content ? base64ParaTexto(arq.content) : base64ParaTexto((await this.req(`/git/blobs/${arq.sha}`)).content);
    return JSON.parse(texto);
  }
  urlBackupCompleto() { return `https://github.com/${this.dono}/${this.repo}/archive/refs/heads/${this.ramo}.zip`; }
}

/* ------------------------------------------------------------------ Local (testes no computador) */
export class ArmazemLocal {
  constructor() { this.tipo = 'local'; }
  async req(caminho, opcoes = {}) {
    const r = await fetch(`/__dev/${caminho}`, { ...opcoes, headers: opcoes.body ? { 'Content-Type': 'application/json' } : {}, cache: 'no-store' });
    if (r.status === 409) throw new ErroConflito('O catálogo foi alterado em outra aba depois que você abriu o painel.');
    if (!r.ok) throw new Error(`Erro ${r.status}: ${await r.text()}`);
    return r.json();
  }
  urlArquivoBruto(caminho) { return `/__dev/arquivo?caminho=${encodeURIComponent(caminho)}`; }
  urlRepositorio() { return null; }
  async testar() { return true; }
  async carregar() { return this.req('catalogo'); }
  async publicar({ dados, arquivos = [], remover = [], mensagem, versaoBase, recuperarDe = null }, progresso = () => {}) {
    progresso('Enviando…');
    const enviados = [];
    for (const a of arquivos) enviados.push({ caminho: a.caminho, base64: await paraBase64(a.blob) });
    return this.req('publicar', { method: 'POST', body: JSON.stringify({ dados, arquivos: enviados, remover, mensagem, versaoBase, recuperarDe }) });
  }
  async historico() { return this.req('historico'); }
  async lerVersao(id) { return this.req(`versao?id=${encodeURIComponent(id)}`); }
  urlBackupCompleto() { return null; }
}

/** Caminhos de todos os arquivos usados pelo catálogo (fotos, originais, áudios). */
export function arquivosReferenciados(dados) {
  const caminhos = [];
  const foto = (f) => {
    if (!f) return;
    for (const t of [400, 800, 1600]) caminhos.push(`fotos/${f.id}-${t}.${f.ext || 'webp'}`);
    caminhos.push(`fotos/${f.id}-og.jpg`);
    if (f.original) caminhos.push(`originais/${f.original}`);
  };
  for (const p of [...(dados.produtos || []), ...(dados.lixeira || [])]) (p.fotos || []).forEach(foto);
  for (const b of dados.inicio?.banners || []) foto(b.imagem);
  for (const c of dados.campanhas || []) { foto(c.banner?.imagem); if (c.musica?.arquivo) caminhos.push(`audio/${c.musica.arquivo}`); }
  return caminhos;
}

// Servidor para testar o site e o painel no seu computador, sem internet.
// Uso: node scripts/dev-server.mjs   →   abra http://localhost:8787  e  http://localhost:8787/painel/
// As alterações feitas no painel são gravadas nesta pasta e registradas no histórico (git).
import http from 'node:http';
import { readFile, writeFile, mkdir, rm, stat } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST = path.join(RAIZ, 'dist');
const PORTA = Number(process.env.PORT || 8787);
const DADOS = path.join(RAIZ, 'data/catalogo.json');
const TIPOS = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2', '.webmanifest': 'application/manifest+json', '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.ogg': 'audio/ogg', '.txt': 'text/plain' };

const git = (...a) => execFileSync('git', a, { cwd: RAIZ, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
const versaoDe = (txt) => createHash('sha1').update(txt).digest('hex');
const gerar = () => execFileSync(process.execPath, [path.join(RAIZ, 'scripts/build.mjs')], { cwd: RAIZ, stdio: 'inherit' });
const seguro = (rel) => {
  const alvo = path.resolve(RAIZ, rel);
  if (!alvo.startsWith(RAIZ + path.sep) || !/^(fotos|originais|audio)\//.test(rel)) throw new Error(`caminho não permitido: ${rel}`);
  return alvo;
};
const corpo = (req) => new Promise((ok, erro) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => ok(Buffer.concat(b).toString('utf8'))); req.on('error', erro); });
const json = (res, s, obj) => { res.writeHead(s, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };

try { git('rev-parse', '--git-dir'); } catch { git('init', '-q', '-b', 'main'); }
gerar();

http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORTA}`);
  try {
    if (url.pathname === '/__dev/catalogo') {
      const txt = await readFile(DADOS, 'utf8');
      return json(res, 200, { dados: JSON.parse(txt), versao: versaoDe(txt) });
    }
    if (url.pathname === '/__dev/publicar' && req.method === 'POST') {
      const { dados, arquivos = [], remover = [], mensagem, versaoBase, recuperarDe } = JSON.parse(await corpo(req));
      const atual = await readFile(DADOS, 'utf8');
      if (versaoBase && versaoBase !== versaoDe(atual)) return json(res, 409, { erro: 'conflito' });
      for (const a of arquivos) { const alvo = seguro(a.caminho); await mkdir(path.dirname(alvo), { recursive: true }); await writeFile(alvo, Buffer.from(a.base64, 'base64')); }
      for (const r of remover) await rm(seguro(r), { force: true });
      if (recuperarDe) {
        const lista = git('ls-tree', '-r', '--name-only', recuperarDe).split('\n').filter((c) => /^(fotos|originais|audio)\//.test(c));
        for (const c of lista) { try { await stat(path.join(RAIZ, c)); } catch { git('checkout', recuperarDe, '--', c); } }
      }
      const txt = JSON.stringify(dados, null, 2);
      await writeFile(DADOS, txt);
      git('add', '-A', 'data', 'fotos', 'originais', 'audio');
      try { git('-c', 'user.name=Painel', '-c', 'user.email=painel@local', 'commit', '-q', '-m', mensagem || 'Atualização pelo painel'); } catch { /* nada mudou */ }
      gerar();
      return json(res, 200, { versao: versaoDe(txt) });
    }
    if (url.pathname === '/__dev/historico') {
      const saida = git('log', '-n', '40', '--format=%H%x1f%aI%x1f%s', '--', 'data/catalogo.json').trim();
      return json(res, 200, saida ? saida.split('\n').map((l) => { const [id, data, mensagem] = l.split('\x1f'); return { id, data, mensagem }; }) : []);
    }
    if (url.pathname === '/__dev/versao') {
      const id = url.searchParams.get('id');
      if (!/^[0-9a-f]{7,40}$/.test(id)) return json(res, 400, { erro: 'id inválido' });
      return json(res, 200, JSON.parse(git('show', `${id}:data/catalogo.json`)));
    }
    if (url.pathname === '/__dev/arquivo') {
      const alvo = seguro(url.searchParams.get('caminho') || '');
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream' });
      return res.end(await readFile(alvo));
    }
    // arquivos estáticos do site gerado
    let rel = decodeURIComponent(url.pathname);
    if (rel.endsWith('/')) rel += 'index.html';
    const alvo = path.resolve(DIST, '.' + rel);
    if (!alvo.startsWith(DIST)) { res.writeHead(403); return res.end(); }
    try {
      const dadosArq = await readFile(alvo);
      res.writeHead(200, { 'Content-Type': TIPOS[path.extname(alvo)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      res.end(dadosArq);
    } catch {
      try { const s = await stat(alvo); if (s.isDirectory()) { res.writeHead(301, { Location: url.pathname + '/' }); return res.end(); } } catch { /* 404 */ }
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(await readFile(path.join(DIST, '404.html')).catch(() => 'Não encontrado'));
    }
  } catch (e) {
    console.error(e);
    json(res, 500, { erro: String(e.message || e) });
  }
}).listen(PORTA, () => console.log(`\n  Site:   http://localhost:${PORTA}\n  Painel: http://localhost:${PORTA}/painel/\n`));

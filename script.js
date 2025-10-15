// Base endpoints
const ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports";
const CORS_PROXIES = [
  url => "https://corsproxy.io/?" + encodeURIComponent(url),
  url => "https://api.allorigins.win/raw?url=" + encodeURIComponent(url),
  url => "https://thingproxy.freeboard.io/fetch/" + url
];

// Helper fetch: try direct, then proxies
async function tryFetch(url){
  const opts = {cache: "no-store"};
  try{
    let r = await fetch(url, opts);
    if(r.ok) return await r.json();
  }catch(e){
    // continue to proxies
  }
  for(const p of CORS_PROXIES){
    try{
      const proxyUrl = p(url);
      const r = await fetch(proxyUrl, opts);
      if(r.ok){
        // some proxies return text (raw) so try parse
        const text = await r.text();
        try{ return JSON.parse(text); } catch(err){ return text; }
      }
    }catch(err){ /* ignore */ }
  }
  throw new Error("fetch_failed");
}

function qs(id){ return document.getElementById(id); }

async function loadSports(){
  const sel = qs('sportSelect');
  sel.innerHTML = '<option>carregando...</option>';
  try{
    const data = await tryFetch(ESPN_BASE);
    const sports = data.sports || [];
    sel.innerHTML = sports.map(s=>`<option value="${s.slug}">${s.name}</option>`).join('');
    populateQuick(sports.slice(0,8));
    // select first sport
    sel.selectedIndex = 0;
    await loadLeaguesForSport(sel.value);
    fetchAll();
  }catch(e){
    sel.innerHTML = '<option>Erro ao carregar</option>';
    qs('newsList').innerHTML = '<div class="empty">Não foi possível obter dados. Tente rodar via servidor local.</div>';
    qs('scoreboard').innerHTML = '<div class="empty">Não foi possível obter dados.</div>';
  }
}

function populateQuick(list){
  const q = qs('quickList');
  q.innerHTML = list.map(s=>`<div class="league-item" data-s="${s.slug}">${s.name}</div>`).join('');
  q.querySelectorAll('.league-item').forEach(el=>el.addEventListener('click', async ()=>{
    qs('sportSelect').value = el.dataset.s;
    await loadLeaguesForSport(el.dataset.s);
    await fetchAll();
  }));
}

async function loadLeaguesForSport(slug){
  const leagueSel = qs('leagueSelect');
  leagueSel.innerHTML = '<option>carregando...</option>';
  try{
    const sportData = await tryFetch(ESPN_BASE + '/' + encodeURIComponent(slug));
    const leagues = sportData.leagues || sportData.sublinks || sportData.sites || [];
    // leagues format can vary; try useful fields
    let opts = [];
    if(Array.isArray(leagues) && leagues.length>0){
      opts = leagues.map(l=>{
        const id = l.uid || (l.slug? l.slug: (l.name? l.name.toLowerCase().replace(/\s+/g,'-'):'league'));
        const label = l.name || l.displayName || l.abbrev || id;
        // If league has a 'league' path segments like 'nba' provide slug path else use uid
        return {id,label,raw:l};
      });
    }
    // fallback manual common leagues
    if(opts.length===0){
      opts = [
        {id:'football/nfl', label:'NFL'},
        {id:'basketball/nba', label:'NBA'},
        {id:'soccer/eng.1', label:'Premier League'}
      ];
    }
    leagueSel.innerHTML = opts.map(o=>`<option value="${o.id}">${o.label}</option>`).join('');
  }catch(e){
    leagueSel.innerHTML = '<option>erro</option>';
  }
}

function makeThumb(url){ return `<div class="thumb">${url? `<img alt="" style="width:100%;height:100%;object-fit:cover" src="${url}">` : 'img'}</div>` }

async function fetchNews(sport, league){
  const out = qs('newsList');
  out.innerHTML = '<div class="loading">Buscando notícias...</div>';
  try{
    // try league-specific news path if league looks like 'basketball/nba'
    let newsUrl = ESPN_BASE + '/' + sport + '/news';
    if(league && league.includes('/')){
      const parts = league.split('/');
      newsUrl = ESPN_BASE + '/' + parts[0] + '/' + parts[1] + '/news';
    }
    const news = await tryFetch(newsUrl);
    let items = news.articles || news.headlines || news.items || news.news || [];
    if(!Array.isArray(items)) items = [];
    if(items.length===0 && news.headlines) items = news.headlines;
    if(items.length===0){
      out.innerHTML = '<div class="empty">Nenhuma notícia encontrada.</div>';
      return;
    }
    out.innerHTML = items.slice(0,8).map(a=>{
      const title = a.title || a.headline || a.name || a.shortDescription || a.lede || '';
      const summary = a.summary || a.description || a.excerpt || '';
      let img = '';
      // try find image fields
      if(a.images && a.images.length) img = a.images[0].url;
      if(!img && a.thumbnail) img = (a.thumbnail.href||'');
      if(!img && a.links && a.links.mobile && a.links.mobile.href) img = '';
      const url = (a.links && a.links.web && a.links.web.href) || a.link || '#';
      return `<div style="margin-bottom:12px">
        <a class="link" href="${url}" target="_blank" rel="noopener noreferrer">
          <div class="article">
            ${makeThumb(img)}
            <div>
              <div style="font-weight:700">${escapeHtml(title)}</div>
              <div class="meta">${escapeHtml(summary)}</div>
            </div>
          </div>
        </a>
      </div>`;
    }).join('');
  }catch(e){
    out.innerHTML = '<div class="empty">Erro ao buscar notícias (CORS/proxy). Tente atualizar.</div>';
  }
}

async function fetchScores(sport, league){
  const out = qs('scoreboard');
  out.innerHTML = '<div class="loading">Buscando placares...</div>';
  try{
    let scoreUrl = ESPN_BASE + '/' + sport + '/scoreboard';
    if(league && league.includes('/')){
      const parts = league.split('/');
      scoreUrl = ESPN_BASE + '/' + parts[0] + '/' + parts[1] + '/scoreboard';
    }
    const data = await tryFetch(scoreUrl);
    const events = data.events || data.games || [];
    if(!events || events.length===0){ out.innerHTML = '<div class="empty">Nenhum placar disponível.</div>'; return; }
    out.innerHTML = events.slice(0,8).map(ev=>{
      const comps = (ev.competitions && ev.competitions[0] && ev.competitions[0].competitors) || ev.competitors || [];
      const vs = comps.map(c=> (c.team && c.team.displayName? c.team.displayName : (c.name||'')) + (c.score? ' ' + c.score : '') ).join(' vs ');
      const status = (ev.status && ev.status.type && (ev.status.type.shortDetail || ev.status.type.description)) || '';
      return `<div style="margin-bottom:10px"><div class="meta">${escapeHtml(vs)}<div class="small">${escapeHtml(status)}</div></div></div>`;
    }).join('');
  }catch(e){
    out.innerHTML = '<div class="empty">Erro ao buscar placares (CORS/proxy).</div>';
  }
}

function escapeHtml(s){ if(!s) return ''; return s.replace(/[&<>"']/g, c=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

async function fetchAll(){
  const sport = qs('sportSelect').value;
  const league = qs('leagueSelect').value;
  await Promise.all([fetchNews(sport, league), fetchScores(sport, league)]);
}

qs('refreshBtn').addEventListener('click', ()=>fetchAll());
qs('sportSelect').addEventListener('change', async ()=>{ await loadLeaguesForSport(qs('sportSelect').value); fetchAll(); });
qs('leagueSelect').addEventListener('change', fetchAll);

window.addEventListener('load', ()=>{ loadSports(); });
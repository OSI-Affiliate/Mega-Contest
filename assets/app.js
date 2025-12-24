async function loadJSON(path){
  const res = await fetch(path);
  if(!res.ok) throw new Error('Failed to load '+path);
  return await res.json();
}

function getLang(){ return localStorage.getItem('lang') || 'hi'; }
function setLang(l){ localStorage.setItem('lang', l); }

function t(strings, key, lang){
  const obj = strings[key];
  if(!obj) return key;
  return (obj[lang] || obj['hi'] || Object.values(obj)[0]);
}

function format(str, vars){
  return str.replace(/\{(\w+)\}/g, (_,k)=>vars[k] ?? '');
}

async function translateCommon(strings, lang){
  const year = new Date().getFullYear();
  document.querySelectorAll('[data-i18n]').forEach(el=>{
    const key = el.getAttribute('data-i18n');
    el.textContent = format(t(strings, key, lang), {year});
  });
  document.querySelectorAll('[data-i18n-ph]').forEach(el=>{
    const key = el.getAttribute('data-i18n-ph');
    el.setAttribute('placeholder', t(strings, key, lang));
  });
  const langSel = document.getElementById('langSel');
  if(langSel){
    langSel.value = lang;
    langSel.addEventListener('change', ()=>{ setLang(langSel.value); location.reload(); });
  }
}

function pickPost(post, lang){
  return {
    title: (lang==='en'? post.title_en : post.title_hi),
    excerpt: (lang==='en'? post.excerpt_en : post.excerpt_hi),
    content: (lang==='en'? post.content_en : post.content_hi)
  };
}

function renderPosts(posts, lang, q=''){
  const grid = document.getElementById('postsGrid');
  if(!grid) return;
  const query = (q||'').toLowerCase().trim();
  const filtered = posts.filter(p=>{
    const a = (p.title_hi + ' ' + p.title_en + ' ' + p.category + ' ' + p.level).toLowerCase();
    return !query || a.includes(query);
  });
  grid.innerHTML = filtered.map(p=>{
    const picked = pickPost(p, lang);
    return `
      <article class="card">
        <div class="meta"><span>${p.category}</span><span>•</span><span>${p.level}</span><span>•</span><span>${p.date}</span></div>
        <h3>${picked.title}</h3>
        <p>${picked.excerpt}</p>
        <a class="btn outline" href="post.html?slug=${encodeURIComponent(p.slug)}">Read →</a>
      </article>
    `;
  }).join('') || `<div class="panel">No results</div>`;
}

function parseCSV(text){
  const rows = [];
  let row = [], field = '', inQuotes = false;
  for(let i=0;i<text.length;i++){
    const c = text[i], n = text[i+1];
    if(c==='"'){
      if(inQuotes && n==='"'){ field+='"'; i++; }
      else inQuotes = !inQuotes;
    } else if(c===',' && !inQuotes){
      row.push(field); field='';
    } else if((c==='\n' || c==='\r') && !inQuotes){
      if(c==='\r' && n==='\n') i++;
      row.push(field); field='';
      if(row.some(x=>x.trim()!=='')) rows.push(row);
      row=[];
    } else {
      field += c;
    }
  }
  row.push(field);
  if(row.some(x=>x.trim()!=='')) rows.push(row);
  return rows;
}

async function loadConfig(){
  try{ return await loadJSON('data/config.json'); }
  catch(e){ return {formUrl:'#', sheetCsvUrl:''}; }
}

async function init(){
  const [strings, posts, config] = await Promise.all([
    loadJSON('data/strings.json'),
    loadJSON('data/posts.json'),
    loadConfig()
  ]);
  const lang = getLang();
  await translateCommon(strings, lang);
  const submitBtn = document.getElementById('submitBtn');
  if(submitBtn && config.formUrl) submitBtn.href = config.formUrl;
  renderPosts(posts, lang);
  const search = document.getElementById('search');
  if(search) search.addEventListener('input', ()=>renderPosts(posts, lang, search.value));
}

async function initPost(){
  const [posts, strings] = await Promise.all([
    loadJSON('data/posts.json'),
    loadJSON('data/strings.json')
  ]);
  const lang = getLang();
  const slug = new URLSearchParams(location.search).get('slug');
  const post = posts.find(p=>p.slug===slug) || posts[0];
  const picked = pickPost(post, lang);
  document.getElementById('postTitle').textContent = picked.title;
  document.getElementById('postMeta').textContent = `${post.category} • ${post.level} • ${post.date}`;
  document.getElementById('postBody').innerHTML = picked.content;
  await translateCommon(strings, lang);
}

async function initSubmissions(){
  const [strings, config] = await Promise.all([
    loadJSON('data/strings.json'),
    loadConfig()
  ]);
  const lang = getLang();
  await translateCommon(strings, lang);

  const formBtn = document.getElementById('openFormBtn');
  if(formBtn && config.formUrl) formBtn.href = config.formUrl;

  const grid = document.getElementById('submissionsGrid');
  const msg = document.getElementById('submissionsMsg');

  if(!config.sheetCsvUrl){
    msg.style.display='block';
    msg.textContent = t(strings,'submissionsEmpty',lang);
    return;
  }

  try{
    const res = await fetch(config.sheetCsvUrl);
    if(!res.ok) throw new Error('CSV fetch failed');
    const rows = parseCSV(await res.text());
    const header = rows[0] || [];
    const data = rows.slice(1).reverse().slice(0, 30);

    const idxName = header.findIndex(h=>/name|नाम/i.test(h));
    const idxTitle = header.findIndex(h=>/title|शीर्षक/i.test(h));
    const idxCategory = header.findIndex(h=>/category|कैटेगरी/i.test(h));
    const idxLink = header.findIndex(h=>/link|url/i.test(h));
    const idxTime = header.findIndex(h=>/timestamp|time|दिनांक/i.test(h));

    grid.innerHTML = data.map(r=>{
      const name = r[idxName] || '—';
      const title = r[idxTitle] || '—';
      const cat = r[idxCategory] || '—';
      const link = r[idxLink] || '';
      const time = r[idxTime] || '';
      const linkBtn = link ? `<a class="btn outline" href="${link}" target="_blank" rel="noopener">Open →</a>` : '';
      return `
        <article class="card">
          <div class="meta"><span>${cat}</span><span>•</span><span>${time}</span></div>
          <h3>${title}</h3>
          <p>${name}</p>
          ${linkBtn}
        </article>
      `;
    }).join('') || `<div class="panel">${t(strings,'submissionsEmpty',lang)}</div>`;
  } catch(e){
    msg.style.display='block';
    msg.textContent = 'Error loading sheet. CSV link check करें।';
  }
}

window.MEGA_CONTEST = { init, initPost, initSubmissions };
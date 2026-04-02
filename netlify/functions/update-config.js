const https = require('https');

// Kullanıcılar (şifreleri buraya ekle)
const USERS = {
  'hakan.sahin': 'dehafatura',
  'berkem.keskin': 'dehafatura2026',
};

const GITHUB_OWNER = 'hhknshnn';
const GITHUB_REPO  = 'fatura-araci';
const GITHUB_FILE  = 'config.json';
const GITHUB_BRANCH = 'main';

function githubRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'fatura-araci',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Token eksik' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geçersiz JSON' }) }; }

  const { action, username, password, sku, kg } = payload;

  // Login kontrolü
  if (!USERS[username] || USERS[username] !== password) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Kullanıcı adı veya şifre hatalı' }) };
  }

  // Mevcut config.json'ı oku
  const getRes = await githubRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`, null, token);
  if (getRes.status !== 200) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'config.json okunamadı' }) };
  }

  const fileSha = getRes.body.sha;
  const config = JSON.parse(Buffer.from(getRes.body.content, 'base64').toString('utf-8'));

  // İşlemi uygula
  if (action === 'verify') {
    // Sadece login doğrulama, config değişmez
    return { statusCode: 200, headers, body: JSON.stringify({ success: true }) };
  } else if (action === 'add') {
    if (!sku || !kg || kg <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geçersiz SKU veya kilo' }) };
    }
    config.defaultExceptionSkus[sku] = kg;
  } else if (action === 'remove') {
    if (!sku) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'SKU belirtilmedi' }) };
    }
    delete config.defaultExceptionSkus[sku];
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geçersiz işlem' }) };
  }

  // config.json'ı güncelle
  const newContent = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  const updateRes = await githubRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
    message: `${action === 'add' ? 'SKU eklendi' : 'SKU silindi'}: ${sku} (${username})`,
    content: newContent,
    sha: fileSha,
    branch: GITHUB_BRANCH,
  }, token);

  if (updateRes.status !== 200 && updateRes.status !== 201) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'config.json güncellenemedi' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, config }),
  };
};

const GITHUB_OWNER = 'hhknshnn';
const GITHUB_REPO  = 'fatura-araci';
const GITHUB_FILE  = 'config.json';
const GITHUB_BRANCH = 'main';

function githubRequest(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path,
      method,
      headers: {
        'Authorization': `token ${token}`,
        'User-Agent': 'fatura-araci',
        'Content-Type': 'application/json',
        'Accept': 'application/vnd.github.v3+json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, res => {
      let raw = '';
      res.on('data', chunk => raw += chunk);
      res.on('end', () => {
        try { resolve({ status: res.statusCode, body: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, body: raw }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Token eksik' }) };
  }

  let payload;
  try { payload = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geçersiz JSON' }) }; }

  const { action, username, password, sku, kg } = payload;

  // Login kontrolü
  if (!USERS[username] || USERS[username] !== password) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Kullanıcı adı veya şifre hatalı' }) };
  }

  // Mevcut config.json'ı oku
  const getRes = await githubRequest('GET', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}?ref=${GITHUB_BRANCH}`, null, token);
  if (getRes.status !== 200) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'config.json okunamadı' }) };
  }

  const fileSha = getRes.body.sha;
  const config = JSON.parse(Buffer.from(getRes.body.content, 'base64').toString('utf-8'));

  // İşlemi uygula
  if (action === 'add') {
    if (!sku || !kg || kg <= 0) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geçersiz SKU veya kilo' }) };
    }
    config.defaultExceptionSkus[sku] = kg;
  } else if (action === 'remove') {
    if (!sku) {
      return { statusCode: 400, headers, body: JSON.stringify({ error: 'SKU belirtilmedi' }) };
    }
    delete config.defaultExceptionSkus[sku];
  } else {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'Geçersiz işlem' }) };
  }

  // config.json'ı güncelle
  const newContent = Buffer.from(JSON.stringify(config, null, 2)).toString('base64');
  const updateRes = await githubRequest('PUT', `/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`, {
    message: `${action === 'add' ? 'SKU eklendi' : 'SKU silindi'}: ${sku} (${username})`,
    content: newContent,
    sha: fileSha,
    branch: GITHUB_BRANCH,
  }, token);

  if (updateRes.status !== 200 && updateRes.status !== 201) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'config.json güncellenemedi' }) };
  }

  return {
    statusCode: 200,
    headers,
    body: JSON.stringify({ success: true, config }),
  };
};

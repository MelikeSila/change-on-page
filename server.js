const express = require('express');
const axios = require('axios');
const crypto = require('crypto');
const cheerio = require('cheerio');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_FILE = path.join(__dirname, 'data.json');

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const monitors = new Map();
const clients = [];
const contentStore = new Map();
const mailConfig = {
  enabled: process.env.MAIL_ENABLED === 'true',
  host: process.env.MAIL_HOST || '',
  port: parseInt(process.env.MAIL_PORT) || 587,
  secure: process.env.MAIL_SECURE === 'true',
  user: process.env.MAIL_USER || '',
  pass: process.env.MAIL_PASS || '',
  from: process.env.MAIL_FROM || '',
  defaultTo: parseEmails(process.env.MAIL_TO || ''),
};

function parseEmails(value) {
  if (Array.isArray(value)) return value.map((e) => e.trim()).filter((e) => e);
  return String(value || '').split(',').map((e) => e.trim()).filter((e) => e);
}

function saveData() {
  try {
    const store = {};
    contentStore.forEach((v, id) => {
      store[id] = v;
    });

    const data = {
      monitors: [...monitors.values()].map((m) => ({
        id: m.id,
        name: m.name,
        url: m.url,
        interval: m.interval,
        emails: m.emails || [],
        active: m.active,
      })),
      contentStore: store,
    };

    fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
  } catch (err) {
    console.error('Veri kaydedilemedi:', err.message);
  }
}

function loadData() {
  if (!fs.existsSync(DATA_FILE)) return;
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));

    (data.monitors || []).forEach((m) => {
      monitors.set(m.id, {
        id: m.id,
        name: m.name,
        url: m.url,
        interval: m.interval,
        emails: parseEmails(m.emails),
        active: false,
        status: 'beklemede',
        lastCheck: null,
        lastChange: null,
        error: null,
        intervalId: null,
        _restoreActive: !!m.active,
      });
    });

    Object.entries(data.contentStore || {}).forEach(([id, v]) => {
      contentStore.set(id, v);
    });

    console.log(`${(data.monitors || []).length} izlenen sayfa data.json'dan yüklendi.`);
  } catch (err) {
    console.error('Veri yüklenemedi:', err.message);
  }
}

function extractText(html) {
  const $ = cheerio.load(html);
  $('script, style, noscript, svg, meta, link, head').remove();
  const lines = [];
  $('body').find('*').each((_i, el) => {
    const text = $(el).clone().children().remove().end().text().trim();
    if (text) lines.push(text);
  });
  return [...new Set(lines)];
}

function findDiff(oldLines, newLines) {
  const oldSet = new Set(oldLines);
  const newSet = new Set(newLines);
  const added = [];
  const removed = [];

  for (const line of newLines) {
    if (!oldSet.has(line)) added.push(line);
  }
  for (const line of oldLines) {
    if (!newSet.has(line)) removed.push(line);
  }

  return { added: added.slice(0, 15), removed: removed.slice(0, 15) };
}

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  clients.forEach((res) => res.write(msg));
}

function sha256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

async function fetchPage(url) {
  const res = await axios.get(url, {
    timeout: 15000,
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'tr-TR,tr;q=0.9,en-US;q=0.8,en;q=0.7',
    },
    responseType: 'text',
  });
  return res.data;
}

async function checkMonitor(id) {
  const monitor = monitors.get(id);
  if (!monitor || !monitor.active) return;

  try {
    const html = await fetchPage(monitor.url);
    const hash = sha256(html);
    const prevData = contentStore.get(id);
    const now = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });

    if (prevData && prevData.hash !== hash) {
      const newText = extractText(html);
      const diff = findDiff(prevData.text, newText);

      monitor.lastChange = now;
      monitor.status = 'degisti';
      broadcast('change', {
        id,
        name: monitor.name,
        url: monitor.url,
        time: now,
        message: `"${monitor.name}" sayfasında değişiklik algılandı!`,
        diff,
      });

      sendMailNotification({
        name: monitor.name,
        url: monitor.url,
        time: now,
        diff,
        emails: monitor.emails && monitor.emails.length > 0 ? monitor.emails : mailConfig.defaultTo,
      }).catch(() => {});

      contentStore.set(id, { hash, text: newText });
      saveData();
    } else if (!prevData) {
      const text = extractText(html);
      contentStore.set(id, { hash, text });
      saveData();
      monitor.firstCheck = now;
    } else {
      contentStore.set(id, { ...prevData, hash });
    }

    monitor.lastCheck = now;
    monitor.error = null;
    if (monitor.status !== 'degisti') monitor.status = 'aktif';
    broadcast('status', { id, status: monitor.status, lastCheck: now });
  } catch (err) {
    monitor.status = 'hata';
    monitor.error = err.message;
    monitor.lastCheck = new Date().toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' });
    broadcast('status', { id, status: 'hata', error: err.message, lastCheck: monitor.lastCheck });
  }
}

let mailTransporter = null;

function getMailTransporter() {
  if (!mailConfig.enabled || !mailConfig.host || !mailConfig.user || !mailConfig.pass) {
    return null;
  }
  if (!mailTransporter) {
    mailTransporter = nodemailer.createTransport({
      host: mailConfig.host,
      port: mailConfig.port,
      secure: mailConfig.secure,
      auth: {
        user: mailConfig.user,
        pass: mailConfig.pass,
      },
    });
  }
  return mailTransporter;
}

async function sendMail({ to, subject, html, text }) {
  const transporter = getMailTransporter();
  if (!transporter) {
    return { ok: false, error: 'Mail yapılandırılmamış (.env dosyasını kontrol edin)' };
  }
  if (!to || to.length === 0) {
    return { ok: false, error: 'Alıcı e-posta yok' };
  }
  try {
    await transporter.sendMail({
      from: mailConfig.from || mailConfig.user,
      to: to.join(', '),
      subject,
      html,
      text,
    });
    return { ok: true };
  } catch (err) {
    console.error('Mail gönderilemedi:', err.message);
    return { ok: false, error: err.message };
  }
}

async function sendMailNotification({ name, url, time, diff, emails }) {
  const addedLines = diff.added ? diff.added.join('\n- ') : 'Yok';
  const removedLines = diff.removed ? diff.removed.join('\n- ') : 'Yok';

  const html = `
      <h2>Sayfada değişiklik algılandı</h2>
      <p><strong>Sayfa:</strong> ${name}</p>
      <p><strong>URL:</strong> <a href="${url}">${url}</a></p>
      <p><strong>Zaman:</strong> ${time}</p>
      ${diff.added && diff.added.length > 0 ? `<h3>Eklenen metinler:</h3><pre>- ${addedLines}</pre>` : ''}
      ${diff.removed && diff.removed.length > 0 ? `<h3>Kaldırılan metinler:</h3><pre>- ${removedLines}</pre>` : ''}
    `;

  return sendMail({
    to: emails,
    subject: `"${name}" sayfasında değişiklik var`,
    html,
    text: `Sayfada değişiklik algılandı\n\nSayfa: ${name}\nURL: ${url}\nZaman: ${time}\n\nEklenen: ${diff.added ? diff.added.join(', ') : 'Yok'}\nKaldırılan: ${diff.removed ? diff.removed.join(', ') : 'Yok'}`,
  });
}

function startMonitoring(id) {
  const monitor = monitors.get(id);
  if (!monitor) return;

  if (monitor.intervalId) clearInterval(monitor.intervalId);

  monitor.active = true;
  checkMonitor(id);
  monitor.intervalId = setInterval(() => checkMonitor(id), monitor.interval);
}

function stopMonitoring(id) {
  const monitor = monitors.get(id);
  if (!monitor) return;
  if (monitor.intervalId) {
    clearInterval(monitor.intervalId);
    monitor.intervalId = null;
  }
  monitor.active = false;
}

// SSE
app.get('/api/events', (req, res) => {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });
  res.write('data: {"type":"connected"}\n\n');
  clients.push(res);
  req.on('close', () => {
    const idx = clients.indexOf(res);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

// Listele
app.get('/api/monitors', (_req, res) => {
  const list = [];
  monitors.forEach((m, id) => {
    list.push({
      id,
      name: m.name,
      url: m.url,
      interval: m.interval,
      active: m.active,
      status: m.status,
      lastCheck: m.lastCheck,
      lastChange: m.lastChange,
      error: m.error,
      emails: m.emails,
    });
  });
  res.json(list);
});

// Mail servisinin hazır olup olmadığı
app.get('/api/mail-status', (_req, res) => {
  res.json({ ready: !!getMailTransporter() });
});

// Test maili gönder
app.post('/api/test-mail', async (req, res) => {
  const emails = parseEmails(req.body.emails);
  const recipients = emails.length > 0 ? emails : mailConfig.defaultTo;

  const result = await sendMail({
    to: recipients,
    subject: 'Test maili — Sayfa Değişiklik Takipçi',
    html: '<h2>Test maili</h2><p>Mail bildirimleri çalışıyor. Bu bir test mailidir.</p>',
    text: 'Test maili. Mail bildirimleri çalışıyor.',
  });

  if (result.ok) return res.json({ ok: true, to: recipients });
  res.status(400).json({ error: result.error });
});

// Ekle
app.post('/api/monitors', (req, res) => {
  const { name, url, interval = 30000, emails } = req.body;
  if (!url) return res.status(400).json({ error: 'URL gerekli' });

  const id = crypto.randomUUID();
  monitors.set(id, {
    id,
    name: name || url,
    url,
    interval: Math.max(interval, 10000),
    emails: parseEmails(emails),
    active: false,
    status: 'beklemede',
    lastCheck: null,
    lastChange: null,
    error: null,
    intervalId: null,
  });

  startMonitoring(id);
  saveData();
  broadcast('added', { id, name: name || url, url });
  res.json({ id });
});

// Alıcı e-postaları güncelle
app.patch('/api/monitors/:id/emails', (req, res) => {
  const monitor = monitors.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Bulunamadı' });

  monitor.emails = parseEmails(req.body.emails);
  saveData();
  broadcast('updated', { id: req.params.id, emails: monitor.emails });
  res.json({ ok: true, emails: monitor.emails });
});

// Kontrol aralığını güncelle
app.patch('/api/monitors/:id/interval', (req, res) => {
  const monitor = monitors.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Bulunamadı' });

  const interval = Math.max(parseInt(req.body.interval) || 30000, 10000);
  monitor.interval = interval;

  if (monitor.active) {
    stopMonitoring(req.params.id);
    startMonitoring(req.params.id);
  }
  saveData();
  broadcast('updated', { id: req.params.id, interval });
  res.json({ ok: true, interval });
});

// Durdur / Devam ettir
app.patch('/api/monitors/:id/toggle', (req, res) => {
  const monitor = monitors.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Bulunamadı' });

  if (monitor.active) {
    stopMonitoring(req.params.id);
  } else {
    startMonitoring(req.params.id);
  }
  saveData();
  res.json({ active: monitor.active });
});

// Sil
app.delete('/api/monitors/:id', (req, res) => {
  const monitor = monitors.get(req.params.id);
  if (!monitor) return res.status(404).json({ error: 'Bulunamadı' });

  stopMonitoring(req.params.id);
  monitors.delete(req.params.id);
  contentStore.delete(req.params.id);
  saveData();
  broadcast('removed', { id: req.params.id });
  res.json({ ok: true });
});

loadData();

app.listen(PORT, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${PORT}`);

  monitors.forEach((m, id) => {
    if (m._restoreActive) {
      delete m._restoreActive;
      startMonitoring(id);
    }
  });

  if (getMailTransporter()) {
    console.log('Mail bildirimi aktif. Alıcılar arayüzden girilir.');
    if (mailConfig.defaultTo.length > 0) {
      console.log(`Varsayılan alıcılar (.env MAIL_TO): ${mailConfig.defaultTo.join(', ')}`);
    }
  } else {
    console.log('Mail bildirimi kapalı (bkz. .env: MAIL_ENABLED, MAIL_USER, MAIL_PASS)');
  }
});

// Servidor de convites e controle de palco do "Convidados ao Vivo".
//
// Ele não transporta vídeo: quem faz isso é o LiveKit (SFU). Este servidor só
//  - entrega as páginas (convite, painel, palco do OBS, vaga individual);
//  - emite tokens de acesso do LiveKit para cada papel;
//  - guarda quem está "no palco" e publica isso nos metadados da sala, que
//    todas as páginas acompanham em tempo real.

import express from 'express';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

const dir = path.dirname(fileURLToPath(import.meta.url));

const {
  LIVEKIT_API_KEY,
  LIVEKIT_API_SECRET,
  SENHA_APRESENTADOR,
  CODIGO_CONVITE = '',
  SALA = 'live',
  LIVEKIT_URL_INTERNA = 'http://127.0.0.1:7880',
  LIVEKIT_URL_PUBLICA = '',
  PORTA = '3000',
} = process.env;

for (const [nome, valor] of Object.entries({ LIVEKIT_API_KEY, LIVEKIT_API_SECRET, SENHA_APRESENTADOR })) {
  if (!valor) {
    console.error(`Falta a variável de ambiente ${nome}.`);
    process.exit(1);
  }
}

const roomService = new RoomServiceClient(LIVEKIT_URL_INTERNA, LIVEKIT_API_KEY, LIVEKIT_API_SECRET);

// Estado do palco. "noPalco" é a lista ordenada de identidades que aparecem na live.
const palco = { noPalco: [], layout: 'grade', nomes: true };

const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
app.use(express.static(path.join(dir, 'public'), { extensions: ['html'] }));
app.use('/lib', express.static(path.join(dir, 'node_modules/livekit-client/dist')));

function iguais(a, b) {
  const x = Buffer.from(String(a ?? ''));
  const y = Buffer.from(String(b ?? ''));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function ehApresentador(req) {
  return iguais(req.get('x-chave') ?? req.query.chave, SENHA_APRESENTADOR);
}

function exigeApresentador(req, res, next) {
  if (ehApresentador(req)) return next();
  res.status(401).json({ erro: 'Senha do apresentador incorreta.' });
}

function urlPublica(req) {
  if (LIVEKIT_URL_PUBLICA) return LIVEKIT_URL_PUBLICA;
  const proto = (req.get('x-forwarded-proto') ?? req.protocol) === 'https' ? 'wss' : 'ws';
  return `${proto}://${req.get('host')}`;
}

async function publicarPalco() {
  const metadata = JSON.stringify(palco);
  try {
    await roomService.updateRoomMetadata(SALA, metadata);
  } catch {
    // A sala ainda não existe (ninguém entrou): cria já com o estado do palco.
    await roomService.createRoom({ name: SALA, emptyTimeout: 60 * 60, metadata });
  }
}

async function garantirSala() {
  try {
    const salas = await roomService.listRooms([SALA]);
    if (salas.length === 0) await roomService.createRoom({ name: SALA, emptyTimeout: 60 * 60, metadata: JSON.stringify(palco) });
    else if (!salas[0].metadata) await roomService.updateRoomMetadata(SALA, JSON.stringify(palco));
  } catch (e) {
    console.warn('Não consegui preparar a sala:', e.message);
  }
}

const papeis = {
  convidado: { publicar: true, oculto: false },
  apresentador: { publicar: true, oculto: false },
  palco: { publicar: false, oculto: true },
};

app.post('/api/token', async (req, res) => {
  const { nome = '', papel = 'convidado', convite = '' } = req.body ?? {};
  const cfg = papeis[papel];
  if (!cfg) return res.status(400).json({ erro: 'Papel inválido.' });

  if (papel === 'convidado') {
    if (CODIGO_CONVITE && !iguais(convite, CODIGO_CONVITE)) {
      return res.status(403).json({ erro: 'Código de convite inválido.' });
    }
  } else if (!ehApresentador(req)) {
    return res.status(401).json({ erro: 'Senha do apresentador incorreta.' });
  }

  const nomeLimpo = String(nome).trim().slice(0, 40) || (papel === 'apresentador' ? 'Apresentador' : 'Convidado');
  const identidade = `${papel}-${crypto.randomBytes(6).toString('hex')}`;

  const at = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
    identity: identidade,
    name: nomeLimpo,
    metadata: JSON.stringify({ papel }),
    ttl: '12h',
  });
  at.addGrant({
    room: SALA,
    roomJoin: true,
    canPublish: cfg.publicar,
    canSubscribe: true,
    canPublishData: false,
    canUpdateOwnMetadata: false,
    hidden: cfg.oculto,
  });

  await garantirSala();
  res.json({ token: await at.toJwt(), url: urlPublica(req), identidade });
});

app.get('/api/estado', exigeApresentador, async (_req, res) => {
  let participantes = [];
  try {
    participantes = (await roomService.listParticipants(SALA))
      .filter((p) => !p.permission?.hidden)
      .map((p) => {
        let papel = 'convidado';
        try { papel = JSON.parse(p.metadata || '{}').papel ?? papel; } catch {}
        return { identidade: p.identity, nome: p.name, papel, entrouEm: Number(p.joinedAt) };
      });
  } catch {
    // Sala vazia ou ainda não criada.
  }
  // Tira do palco quem já saiu da sala.
  const presentes = new Set(participantes.map((p) => p.identidade));
  const antes = palco.noPalco.length;
  palco.noPalco = palco.noPalco.filter((id) => presentes.has(id));
  if (palco.noPalco.length !== antes) await publicarPalco().catch(() => {});

  res.json({ palco, participantes, codigoConvite: CODIGO_CONVITE });
});

app.post('/api/palco', exigeApresentador, async (req, res) => {
  const { noPalco, layout, nomes } = req.body ?? {};
  if (Array.isArray(noPalco)) palco.noPalco = [...new Set(noPalco.map(String))].slice(0, 100);
  if (['grade', 'destaque'].includes(layout)) palco.layout = layout;
  if (typeof nomes === 'boolean') palco.nomes = nomes;
  try {
    await publicarPalco();
    res.json({ palco });
  } catch (e) {
    res.status(502).json({ erro: `Não consegui falar com o LiveKit: ${e.message}` });
  }
});

app.post('/api/remover', exigeApresentador, async (req, res) => {
  const identidade = String(req.body?.identidade ?? '');
  palco.noPalco = palco.noPalco.filter((id) => id !== identidade);
  try {
    await roomService.removeParticipant(SALA, identidade);
  } catch {}
  await publicarPalco().catch(() => {});
  res.json({ palco });
});

app.get('/api/saude', (_req, res) => res.json({ ok: true }));

app.listen(Number(PORTA), () => {
  console.log(`Convidados ao Vivo ouvindo na porta ${PORTA} (sala "${SALA}")`);
});

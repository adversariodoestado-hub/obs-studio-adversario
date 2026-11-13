// Funções compartilhadas pelas páginas (convite, painel, palco e vaga).
/* global LivekitClient */
(() => {

const LK = window.LivekitClient;

const params = new URLSearchParams(location.search);

async function pedirToken({ papel, nome = '', convite = '', chave = '' }) {
  const r = await fetch('/api/token', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-chave': chave },
    body: JSON.stringify({ papel, nome, convite }),
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || `Erro ${r.status}`);
  return dados;
}

function lerPalco(room) {
  try {
    const m = JSON.parse(room.metadata || '{}');
    return { noPalco: m.noPalco || [], layout: m.layout || 'grade', nomes: m.nomes !== false };
  } catch {
    return { noPalco: [], layout: 'grade', nomes: true };
  }
}

function papelDe(participante) {
  try {
    return JSON.parse(participante.metadata || '{}').papel || 'convidado';
  } catch {
    return 'convidado';
  }
}

// Calcula retângulos (em %) para N quadros 16:9 dentro de uma tela 16:9.
function calcularLayout(n, modo = 'grade', espaco = 1) {
  if (n <= 0) return [];
  if (modo === 'destaque' && n > 1) {
    const principal = { x: 0, y: 0, w: 75, h: 75 };
    const resto = n - 1;
    const rects = [];
    // Destaque ocupa 75% da largura; os demais ficam numa coluna à direita
    // (até 4) e o excedente numa faixa embaixo.
    const naColuna = Math.min(resto, 4);
    const hCol = 100 / Math.max(naColuna, 4);
    for (let i = 0; i < naColuna; i++) {
      rects.push({ x: 75 + espaco / 2, y: i * hCol + espaco / 2, w: 25 - espaco, h: hCol - espaco });
    }
    const naFaixa = resto - naColuna;
    if (naFaixa > 0) {
      const wF = 75 / naFaixa;
      for (let i = 0; i < naFaixa; i++) {
        rects.push({ x: i * wF + espaco / 2, y: 75 + espaco / 2, w: wF - espaco, h: 25 - espaco });
      }
    } else {
      principal.w = 75; principal.h = 100;
    }
    return [principal, ...rects];
  }

  // Grade: escolhe o número de colunas que deixa cada quadro 16:9 maior.
  let melhor = { cols: 1, rows: n, lado: 0 };
  for (let cols = 1; cols <= n; cols++) {
    const rows = Math.ceil(n / cols);
    const larg = Math.min(100 / cols, 100 / rows); // em % da tela (tela e quadro são 16:9)
    if (larg >= melhor.lado) melhor = { cols, rows, lado: larg };
  }
  const { cols, rows, lado } = melhor;
  const offY = (100 - rows * lado) / 2;
  const rects = [];
  for (let i = 0; i < n; i++) {
    const linha = Math.floor(i / cols);
    const naLinha = linha === rows - 1 ? n - linha * cols : cols; // última linha centralizada
    const offX = (100 - naLinha * lado) / 2;
    const col = i - linha * cols;
    rects.push({ x: offX + col * lado + espaco / 2, y: offY + linha * lado + espaco / 2, w: lado - espaco, h: lado - espaco });
  }
  return rects;
}

function iniciais(nome) {
  return (nome || '?').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0].toUpperCase()).join('');
}

window.Comum = { LK, params, pedirToken, lerPalco, papelDe, calcularLayout, iniciais };
})();

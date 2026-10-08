// Prozedural erzeugte Canvas-Texturen
import * as THREE from 'three';
import { mulberry32 } from './util.js';

const cache = new Map();

function make(w, h, draw, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function frame(g, w, h, color, width) {
  g.strokeStyle = color;
  g.lineWidth = width;
  g.strokeRect(width / 2, width / 2, w - width, h - width);
}

const builders = {
  wood() {
    return make(256, 256, (g, w, h) => {
      const r = mulberry32(11);
      for (let i = 0; i < 8; i++) {
        const y = i * 32;
        g.fillStyle = `hsl(28, ${48 + r() * 8}%, ${42 + r() * 9}%)`;
        g.fillRect(0, y, w, 32);
        g.fillStyle = 'rgba(55,28,8,0.55)';
        g.fillRect(0, y, w, 3);
        g.strokeStyle = 'rgba(90,48,18,0.28)';
        g.lineWidth = 1.5;
        for (let k = 0; k < 5; k++) {
          const yy = y + 7 + r() * 20;
          g.beginPath();
          g.moveTo(0, yy);
          g.bezierCurveTo(w * 0.3, yy + r() * 6 - 3, w * 0.6, yy + r() * 6 - 3, w, yy);
          g.stroke();
        }
        g.fillStyle = 'rgba(55,28,8,0.5)';
        g.fillRect(r() * w, y, 3, 32);
      }
      frame(g, w, h, '#6a3f1d', 18);
      g.strokeStyle = '#7a4a22';
      g.lineWidth = 15;
      g.beginPath();
      g.moveTo(16, h - 16);
      g.lineTo(w - 16, 16);
      g.stroke();
      g.fillStyle = '#2e2a26';
      for (const [x, y] of [[14, 14], [w - 14, 14], [14, h - 14], [w - 14, h - 14]]) {
        g.beginPath();
        g.arc(x, y, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    });
  },
  stone() {
    return make(256, 256, (g, w, h) => {
      const r = mulberry32(22);
      g.fillStyle = '#6f6d68';
      g.fillRect(0, 0, w, h);
      const bh = 32, bw = 64;
      for (let row = 0; row < h / bh; row++) {
        const off = row % 2 ? bw / 2 : 0;
        for (let col = -1; col < w / bw + 1; col++) {
          const x = col * bw + off;
          const l = 52 + r() * 14;
          g.fillStyle = `hsl(${30 + r() * 15}, ${8 + r() * 10}%, ${l}%)`;
          g.fillRect(x + 3, row * bh + 3, bw - 6, bh - 6);
          g.fillStyle = 'rgba(255,255,255,0.08)';
          g.fillRect(x + 3, row * bh + 3, bw - 6, 4);
        }
      }
      frame(g, w, h, '#55534f', 12);
    });
  },
  metal() {
    return make(256, 256, (g, w, h) => {
      for (let x = 0; x < w; x += 16) {
        const grad = g.createLinearGradient(x, 0, x + 16, 0);
        grad.addColorStop(0, '#7f8b98');
        grad.addColorStop(0.5, '#b6c1cc');
        grad.addColorStop(1, '#6e7987');
        g.fillStyle = grad;
        g.fillRect(x, 0, 16, h);
      }
      frame(g, w, h, '#4f5864', 20);
      g.fillStyle = '#c9d2db';
      for (let i = 0; i < 6; i++) {
        const p = 20 + i * ((w - 40) / 5);
        for (const [x, y] of [[p, 10], [p, h - 10], [10, p], [w - 10, p]]) {
          g.beginPath();
          g.arc(x, y, 3.2, 0, Math.PI * 2);
          g.fill();
        }
      }
    });
  },
  glow() {
    return make(64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(0.35, 'rgba(255,255,255,0.55)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
  },
  ring() {
    return make(128, 128, (g) => {
      g.strokeStyle = 'rgba(70,170,255,1)';
      g.lineWidth = 12;
      g.beginPath();
      g.arc(64, 64, 46, 0, Math.PI * 2);
      g.stroke();
      g.strokeStyle = 'rgba(200,235,255,1)';
      g.lineWidth = 5;
      g.beginPath();
      g.arc(64, 64, 46, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = 'rgba(160,215,255,0.9)';
      g.beginPath();
      g.arc(64, 64, 14, 0, Math.PI * 2);
      g.fill();
    });
  },
  smoke() {
    return make(64, 64, (g, w, h) => {
      const grad = g.createRadialGradient(32, 32, 2, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,0.85)');
      grad.addColorStop(0.6, 'rgba(255,255,255,0.35)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
    });
  },
  storm() {
    return make(256, 256, (g, w, h) => {
      const r = mulberry32(5);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, w, h);
      for (let i = 0; i < 70; i++) {
        g.fillStyle = `rgba(0,0,0,${0.1 + r() * 0.35})`;
        const x = r() * w;
        g.fillRect(x, 0, 2 + r() * 10, h);
      }
    }, false);
  },
  gold() {
    return make(128, 128, (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h);
      grad.addColorStop(0, '#ffe27a');
      grad.addColorStop(0.5, '#f2b51c');
      grad.addColorStop(1, '#b97a06');
      g.fillStyle = grad;
      g.fillRect(0, 0, w, h);
      frame(g, w, h, '#8a5a06', 10);
      g.fillStyle = '#fff3b0';
      g.fillRect(w / 2 - 10, h / 2 - 12, 20, 24);
      g.fillStyle = '#8a5a06';
      g.fillRect(w / 2 - 3, h / 2 - 4, 6, 10);
    });
  },
  bus() {
    return make(512, 128, (g, w, h) => {
      g.fillStyle = '#2a6fdb';
      g.fillRect(0, 0, w, h);
      g.fillStyle = '#ffffff';
      g.fillRect(0, 84, w, 10);
      g.fillStyle = '#ffd400';
      g.fillRect(0, 96, w, 8);
      g.fillStyle = '#1b2a44';
      for (let i = 0; i < 6; i++) g.fillRect(24 + i * 80, 14, 62, 40);
      g.font = 'bold 30px Impact, Arial Black, sans-serif';
      g.fillStyle = '#ffffff';
      g.textAlign = 'center';
      g.fillText('STROTHI-BUS', w / 2, 126);
    });
  },
};

export function tex(name) {
  if (!cache.has(name)) cache.set(name, builders[name]());
  return cache.get(name);
}

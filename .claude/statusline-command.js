#!/usr/bin/env node
'use strict';
import { createRequire } from 'module';
import { fileURLToPath } from 'url';
import { dirname as _dirname } from 'path';
const require = createRequire(import.meta.url);
const __dirname = _dirname(fileURLToPath(import.meta.url));

// Claude Code statusLine — stdin으로 session JSON 수신
// Manual run (TTY) or no piped data → default output without hanging

function render(data) {
  const model     = data.model?.display_name || '';
  const ctx       = data.context_window || {};
  const usedPct   = ctx.used_percentage;
  const ctxSize   = ctx.context_window_size || 200000;
  const usage     = ctx.current_usage || {};
  const totalUsed = (usage.input_tokens || 0)
                  + (usage.cache_read_input_tokens || 0)
                  + (usage.cache_creation_input_tokens || 0);

  const rate5h    = data.rate_limits?.five_hour?.used_percentage;

  // context 색상 아이콘
  let ctxIcon = '🟢';
  if      (usedPct >= 80) ctxIcon = '🔴';
  else if (usedPct >= 50) ctxIcon = '🟡';

  // 출력 조합
  const parts = [];

  if (model) parts.push(model.replace(/\s*\([^)]*\)\s*/g, '').trim());

  if (usedPct !== undefined) {
    const kUsed = Math.round(totalUsed / 1000);
    const kMax  = Math.round(ctxSize  / 1000);
    parts.push(`${ctxIcon} ctx ${usedPct}% (${kUsed}k/${kMax}k)`);
  }

  if (rate5h !== undefined) {
    const rateIcon = rate5h >= 80 ? '⚠️ ' : '';
    parts.push(`${rateIcon}rate ${rate5h}%`);
  }

  // afd daemon status
  function finish() {
    console.log(parts.length ? parts.join(' │ ') : 'Autonomous Flow Daemon');
    process.exit(0);
  }

  try {
    const fs = require('fs');
    const path = require('path');
    const portFile = path.resolve(__dirname, '..', '.afd', 'daemon.port');

    if (!fs.existsSync(portFile)) {
      parts.push('🛡️ afd: OFF');
      finish();
      return;
    }

    const port = fs.readFileSync(portFile, 'utf-8').trim();

    fetch(`http://127.0.0.1:${port}/mini-status`, {
      signal: AbortSignal.timeout(200),
    })
      .then(r => r.json())
      .then(d => {
        const defenseText = d.total_defenses > 0 ? `${d.total_defenses}건 방어` : 'ON';
        const currentSavedK = d.saved_tokens_k || 0;

        // Session-scoped baseline tracking
        const baselineFile = path.resolve(__dirname, '..', '.afd', 'session_baseline_saved.json');
        let sessionSavedK = 0;
        try {
          let baseline = { savedK: currentSavedK, lastTotalUsed: totalUsed };
          if (fs.existsSync(baselineFile)) {
            const existing = JSON.parse(fs.readFileSync(baselineFile, 'utf-8'));
            // 새 세션 감지: totalUsed가 이전보다 크게 줄었으면 세션 리셋
            if (totalUsed < existing.lastTotalUsed * 0.5) {
              baseline = { savedK: currentSavedK, lastTotalUsed: totalUsed };
            } else {
              baseline = { savedK: existing.savedK, lastTotalUsed: totalUsed };
              sessionSavedK = Math.max(0, Math.round((currentSavedK - existing.savedK) * 10) / 10);
            }
          }
          fs.writeFileSync(baselineFile, JSON.stringify(baseline), 'utf-8');
        } catch { /* crash-only: baseline 실패 시 조용히 무시 */ }

        // 현재 세션 기준 ctx 절약률
        const sessionSavedRaw = sessionSavedK * 1000;
        const sessionPotential = totalUsed + sessionSavedRaw;
        const ctxSavePct = sessionPotential > 0 && sessionSavedRaw > 0
          ? Math.round(sessionSavedRaw / sessionPotential * 100)
          : 0;

        const savedText = sessionSavedK > 0
          ? ` (⬇️ ${sessionSavedK}k 절약, ctx -${ctxSavePct}%)`
          : '';
        parts.push(`🛡️ afd: ${defenseText}${savedText}`);
        finish();
      })
      .catch(() => {
        parts.push('🛡️ afd: OFF');
        finish();
      });
  } catch {
    parts.push('🛡️ afd: OFF');
    finish();
  }
}

// Short-circuit: TTY means manual run → no stdin data expected
if (process.stdin.isTTY) {
  render({});
} else {
  // Piped mode: read stdin but bail after 100ms if nothing arrives
  let fired = false;
  const chunks = [];

  const timer = setTimeout(() => {
    if (!fired) {
      fired = true;
      process.stdin.destroy();
      render({});
    }
  }, 100);

  process.stdin.on('data', c => chunks.push(c));
  process.stdin.on('end', () => {
    if (fired) return;
    fired = true;
    clearTimeout(timer);
    let data = {};
    try { data = JSON.parse(Buffer.concat(chunks).toString()); } catch {}
    render(data);
  });
}

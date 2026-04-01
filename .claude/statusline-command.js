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

  const cost      = data.cost?.total_cost_usd;
  const rate5h    = data.rate_limits?.five_hour?.used_percentage;

  // git branch (동기 실행)
  let branch = '';
  try {
    const { execSync } = require('child_process');
    branch = execSync('git rev-parse --abbrev-ref HEAD', {
      cwd: process.cwd(), stdio: ['pipe', 'pipe', 'pipe']
    }).toString().trim();
  } catch {}

  // context 색상 아이콘
  let ctxIcon = '🟢';
  if      (usedPct >= 80) ctxIcon = '🔴';
  else if (usedPct >= 50) ctxIcon = '🟡';

  // 출력 조합
  const parts = [];

  if (model) parts.push(model);

  if (usedPct !== undefined) {
    const kUsed = Math.round(totalUsed / 1000);
    const kMax  = Math.round(ctxSize  / 1000);
    parts.push(`${ctxIcon} ctx ${usedPct}% (${kUsed}k/${kMax}k)`);
  }

  if (rate5h !== undefined) {
    const rateIcon = rate5h >= 80 ? '⚠️ ' : '';
    parts.push(`${rateIcon}rate ${rate5h}%`);
  }

  if (cost !== undefined) {
    parts.push(`$${cost.toFixed(3)}`);
  }

  if (branch) parts.push(`⎇ ${branch}`);

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
        let afd = '';
        if (d.total_defenses > 0 && d.defense_reasons && d.defense_reasons.length > 0) {
          afd = `🛡️ [afd] ${d.total_defenses}건 방어 (${d.defense_reasons.join(', ')})`;
        } else if (d.healed_count > 0) {
          afd = `🛡️ [afd] ${d.healed_count}건 방어`;
        } else {
          afd = `🛡️ afd: ON`;
        }
        parts.push(afd);
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

/**
 * Control Server - System Administration Interface
 * Port: 5353
 */
import Fastify from 'fastify';
import cors from '@fastify/cors';
import cookie from '@fastify/cookie';
import formbody from '@fastify/formbody';
import { randomBytes } from 'crypto';
// Storage
const systems = new Map();
const sessions = new Map();
// Admin credentials
const ADMIN_USER = process.env.CONTROL_ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.CONTROL_ADMIN_PASS || 'admin123@';
// Generate session token
function generateToken() {
    return randomBytes(32).toString('hex');
}
// Verify session
function verifySession(token) {
    const session = sessions.get(token);
    if (!session)
        return false;
    if (new Date() > session.expiresAt) {
        sessions.delete(token);
        return false;
    }
    return true;
}
// CSS Styles
const styles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: linear-gradient(135deg, #0f172a 0%, #1e293b 100%); color: #e2e8f0; min-height: 100vh; }

  /* Login Page */
  .login-container { min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .login-box { background: #1e293b; border-radius: 16px; padding: 40px; width: 100%; max-width: 400px; box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5); border: 1px solid #334155; }
  .login-logo { text-align: center; margin-bottom: 32px; }
  .login-logo svg { width: 64px; height: 64px; color: #3b82f6; }
  .login-logo h1 { font-size: 24px; margin-top: 16px; color: #f1f5f9; }
  .login-logo p { color: #64748b; font-size: 14px; margin-top: 8px; }
  .form-group { margin-bottom: 20px; }
  .form-label { display: block; margin-bottom: 8px; color: #94a3b8; font-size: 14px; font-weight: 500; }
  .form-input { width: 100%; padding: 12px 16px; background: #0f172a; border: 1px solid #334155; border-radius: 8px; color: #e2e8f0; font-size: 15px; transition: all 0.2s; }
  .form-input:focus { outline: none; border-color: #3b82f6; box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2); }
  .form-input::placeholder { color: #475569; }
  .btn-login { width: 100%; padding: 14px; background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); color: white; border: none; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; transition: all 0.2s; }
  .btn-login:hover { transform: translateY(-1px); box-shadow: 0 10px 20px -10px rgba(59, 130, 246, 0.5); }
  .error-msg { background: #7f1d1d; color: #fca5a5; padding: 12px 16px; border-radius: 8px; margin-bottom: 20px; font-size: 14px; display: none; }
  .error-msg.show { display: block; }

  /* Dashboard */
  .dashboard { min-height: 100vh; }
  .navbar { background: #1e293b; border-bottom: 1px solid #334155; padding: 0 24px; height: 64px; display: flex; align-items: center; justify-content: space-between; position: sticky; top: 0; z-index: 100; }
  .navbar-brand { display: flex; align-items: center; gap: 12px; }
  .navbar-brand svg { width: 32px; height: 32px; color: #3b82f6; }
  .navbar-brand span { font-size: 18px; font-weight: 600; color: #f1f5f9; }
  .navbar-user { display: flex; align-items: center; gap: 16px; }
  .navbar-user span { color: #94a3b8; font-size: 14px; }
  .btn-logout { padding: 8px 16px; background: #dc2626; color: white; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; }
  .btn-logout:hover { background: #b91c1c; }

  .container { max-width: 1400px; margin: 0 auto; padding: 24px; }
  .page-title { font-size: 28px; font-weight: 700; color: #f1f5f9; margin-bottom: 8px; }
  .page-subtitle { color: #64748b; margin-bottom: 32px; }

  .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 20px; margin-bottom: 32px; }
  .stat-card { background: #1e293b; padding: 24px; border-radius: 12px; border: 1px solid #334155; transition: all 0.2s; }
  .stat-card:hover { border-color: #475569; transform: translateY(-2px); }
  .stat-icon { width: 48px; height: 48px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 16px; }
  .stat-icon.blue { background: rgba(59, 130, 246, 0.2); color: #3b82f6; }
  .stat-icon.green { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
  .stat-icon.red { background: rgba(239, 68, 68, 0.2); color: #ef4444; }
  .stat-icon.yellow { background: rgba(234, 179, 8, 0.2); color: #eab308; }
  .stat-value { font-size: 36px; font-weight: 700; color: #f1f5f9; }
  .stat-label { color: #64748b; font-size: 14px; margin-top: 4px; }

  .card { background: #1e293b; border-radius: 12px; border: 1px solid #334155; overflow: hidden; }
  .card-header { padding: 20px 24px; border-bottom: 1px solid #334155; display: flex; align-items: center; justify-content: space-between; }
  .card-title { font-size: 16px; font-weight: 600; color: #f1f5f9; }
  .card-body { padding: 0; }

  table { width: 100%; border-collapse: collapse; }
  th, td { padding: 16px 24px; text-align: left; }
  th { background: #0f172a; font-weight: 600; color: #94a3b8; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px; }
  tr { border-bottom: 1px solid #334155; transition: all 0.2s; }
  tr:hover { background: rgba(59, 130, 246, 0.05); }
  tr:last-child { border-bottom: none; }

  .status-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; margin-right: 10px; }
  .status-dot.online { background: #22c55e; box-shadow: 0 0 8px rgba(34, 197, 94, 0.5); animation: pulse 2s infinite; }
  .status-dot.offline { background: #64748b; }
  @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.5; } }

  .badge { padding: 6px 12px; border-radius: 6px; font-size: 12px; font-weight: 600; }
  .badge-active { background: rgba(34, 197, 94, 0.2); color: #22c55e; }
  .badge-blocked { background: rgba(239, 68, 68, 0.2); color: #ef4444; }

  .hostname { font-weight: 600; color: #f1f5f9; }
  .fingerprint { font-family: 'JetBrains Mono', monospace; font-size: 12px; color: #64748b; background: #0f172a; padding: 4px 8px; border-radius: 4px; }
  .meta { color: #64748b; font-size: 13px; }

  .actions { display: flex; gap: 8px; }
  .btn { padding: 8px 14px; border: none; border-radius: 6px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all 0.2s; display: inline-flex; align-items: center; gap: 6px; }
  .btn-primary { background: #3b82f6; color: white; }
  .btn-primary:hover { background: #2563eb; }
  .btn-danger { background: #dc2626; color: white; }
  .btn-danger:hover { background: #b91c1c; }
  .btn-success { background: #16a34a; color: white; }
  .btn-success:hover { background: #15803d; }
  .btn-secondary { background: #475569; color: white; }
  .btn-secondary:hover { background: #334155; }

  .empty { text-align: center; padding: 80px 20px; }
  .empty svg { width: 64px; height: 64px; color: #475569; margin-bottom: 16px; }
  .empty h3 { color: #94a3b8; font-size: 18px; margin-bottom: 8px; }
  .empty p { color: #64748b; font-size: 14px; }

  /* Modal */
  .modal { display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0, 0, 0, 0.7); backdrop-filter: blur(4px); justify-content: center; align-items: center; z-index: 1000; }
  .modal.show { display: flex; }
  .modal-content { background: #1e293b; padding: 32px; border-radius: 16px; width: 90%; max-width: 480px; border: 1px solid #334155; animation: modalIn 0.2s ease; }
  @keyframes modalIn { from { opacity: 0; transform: scale(0.95); } to { opacity: 1; transform: scale(1); } }
  .modal-header { display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px; }
  .modal-title { font-size: 20px; font-weight: 600; color: #f1f5f9; }
  .modal-close { background: none; border: none; color: #64748b; cursor: pointer; padding: 4px; }
  .modal-close:hover { color: #94a3b8; }
  .modal-footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; padding-top: 24px; border-top: 1px solid #334155; }

  textarea.form-input { min-height: 100px; resize: vertical; font-family: inherit; }
`;
// Login Page HTML
const loginPage = (error) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Login - Control Panel</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  <div class="login-container">
    <div class="login-box">
      <div class="login-logo">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <h1>Control Panel</h1>
        <p>Sistema de Gerenciamento</p>
      </div>

      <div class="error-msg ${error ? 'show' : ''}">${error || ''}</div>

      <form method="POST" action="/auth/login">
        <div class="form-group">
          <label class="form-label">Usuário</label>
          <input type="text" name="username" class="form-input" placeholder="Digite seu usuário" required autofocus>
        </div>
        <div class="form-group">
          <label class="form-label">Senha</label>
          <input type="password" name="password" class="form-input" placeholder="Digite sua senha" required>
        </div>
        <button type="submit" class="btn-login">Entrar</button>
      </form>
    </div>
  </div>
</body>
</html>
`;
// Dashboard HTML
const dashboardPage = (systemList) => `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Dashboard - Control Panel</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body>
  <div class="dashboard">
    <nav class="navbar">
      <div class="navbar-brand">
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
        </svg>
        <span>Control Panel</span>
      </div>
      <div class="navbar-user">
        <span>Olá, <strong>Admin</strong></span>
        <a href="/auth/logout" class="btn-logout">Sair</a>
      </div>
    </nav>

    <div class="container">
      <h1 class="page-title">Dashboard</h1>
      <p class="page-subtitle">Gerencie todas as instalações do sistema</p>

      <div class="stats">
        <div class="stat-card">
          <div class="stat-icon blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01" />
            </svg>
          </div>
          <div class="stat-value">${systemList.length}</div>
          <div class="stat-label">Total de Sistemas</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="stat-value">${systemList.filter(s => s.active).length}</div>
          <div class="stat-label">Sistemas Ativos</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
            </svg>
          </div>
          <div class="stat-value">${systemList.reduce((acc, s) => acc + (s.totalInstances || 0), 0)}</div>
          <div class="stat-label">Total Instâncias</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
            </svg>
          </div>
          <div class="stat-value">${systemList.reduce((acc, s) => acc + (s.totalMessages || 0), 0).toLocaleString('pt-BR')}</div>
          <div class="stat-label">Total Mensagens</div>
        </div>
      </div>

      <div class="stats" style="margin-top: -12px;">
        <div class="stat-card">
          <div class="stat-icon red">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
          <div class="stat-value">${systemList.filter(s => !s.active).length}</div>
          <div class="stat-label">Bloqueados</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon blue">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div class="stat-value">${systemList.filter(s => isOnline(s.lastSeen)).length}</div>
          <div class="stat-label">Online Agora</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon green">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <div class="stat-value">${systemList.reduce((acc, s) => acc + (s.totalUsers || 0), 0)}</div>
          <div class="stat-label">Total Usuários</div>
        </div>
        <div class="stat-card">
          <div class="stat-icon yellow">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          <div class="stat-value">${systemList.reduce((acc, s) => acc + (s.connectedInstances || 0), 0)}</div>
          <div class="stat-label">Instâncias Conectadas</div>
        </div>
      </div>

      <div class="card">
        <div class="card-header">
          <h2 class="card-title">Sistemas Registrados</h2>
          <button class="btn btn-secondary" onclick="location.reload()">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Atualizar
          </button>
        </div>
        <div class="card-body">
          ${systemList.length === 0 ? `
            <div class="empty">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2" />
              </svg>
              <h3>Nenhum sistema registrado</h3>
              <p>Os sistemas aparecerão aqui quando se conectarem</p>
            </div>
          ` : `
            <table>
              <thead>
                <tr>
                  <th>Status</th>
                  <th>Sistema</th>
                  <th>IP</th>
                  <th>Instâncias</th>
                  <th>Usuários</th>
                  <th>Mensagens</th>
                  <th>Última Atividade</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                ${systemList.map(s => `
                  <tr>
                    <td>
                      <span class="status-dot ${isOnline(s.lastSeen) ? 'online' : 'offline'}"></span>
                      <span class="badge ${s.active ? 'badge-active' : 'badge-blocked'}">${s.active ? 'Ativo' : 'Bloqueado'}</span>
                    </td>
                    <td>
                      <div class="hostname">${escapeHtml(s.hostname)}</div>
                      <div class="meta">${escapeHtml(s.environment)} • v${escapeHtml(s.version)}</div>
                    </td>
                    <td><code class="fingerprint">${escapeHtml(s.ip || 'N/A')}</code></td>
                    <td>
                      <div style="font-weight:600;color:#22c55e">${s.connectedInstances || 0} <span style="color:#64748b;font-weight:400">/ ${s.totalInstances || 0}</span></div>
                      <div class="meta">conectadas / total</div>
                    </td>
                    <td><span style="font-weight:600">${s.totalUsers || 0}</span></td>
                    <td><span style="font-weight:600">${(s.totalMessages || 0).toLocaleString('pt-BR')}</span></td>
                    <td>
                      <div class="meta">${getTimeAgo(s.lastSeen)}</div>
                      <div class="meta">Desde ${formatDate(s.firstSeen)}</div>
                    </td>
                    <td class="actions">
                      <button class="btn btn-primary" onclick="editSystem('${s.fingerprint}')">Editar</button>
                      ${s.active
    ? `<button class="btn btn-danger" onclick="toggleStatus('${s.fingerprint}', false)">Bloquear</button>`
    : `<button class="btn btn-success" onclick="toggleStatus('${s.fingerprint}', true)">Ativar</button>`}
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>
    </div>
  </div>

  <div id="editModal" class="modal">
    <div class="modal-content">
      <div class="modal-header">
        <h3 class="modal-title">Editar Sistema</h3>
        <button class="modal-close" onclick="closeModal()">
          <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
      <form id="editForm">
        <input type="hidden" id="editFingerprint">
        <div class="form-group">
          <label class="form-label">Hostname</label>
          <input type="text" class="form-input" id="editHostname" readonly style="opacity: 0.7;">
        </div>
        <div class="form-group">
          <label class="form-label">Mensagem de Bloqueio</label>
          <textarea class="form-input" id="editMessage" placeholder="Mensagem exibida quando o sistema está bloqueado..."></textarea>
        </div>
        <div class="form-group">
          <label class="form-label">Notas Internas</label>
          <textarea class="form-input" id="editNotes" placeholder="Notas visíveis apenas para administradores..."></textarea>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" onclick="closeModal()">Cancelar</button>
          <button type="submit" class="btn btn-primary">Salvar</button>
        </div>
      </form>
    </div>
  </div>

  <script>
    const systems = ${JSON.stringify(Object.fromEntries(systems))};

    function toggleStatus(fp, active) {
      if (!confirm(active ? 'Deseja ativar este sistema?' : 'Deseja bloquear este sistema?')) return;

      fetch('/api/admin/toggle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fingerprint: fp, active })
      }).then(r => {
        if (r.ok) location.reload();
        else alert('Erro ao atualizar status');
      });
    }

    function editSystem(fp) {
      const sys = systems[fp];
      if (!sys) return;

      document.getElementById('editFingerprint').value = fp;
      document.getElementById('editHostname').value = sys.hostname;
      document.getElementById('editMessage').value = sys.message || '';
      document.getElementById('editNotes').value = sys.notes || '';
      document.getElementById('editModal').classList.add('show');
    }

    function closeModal() {
      document.getElementById('editModal').classList.remove('show');
    }

    document.getElementById('editForm').onsubmit = function(e) {
      e.preventDefault();
      fetch('/api/admin/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          fingerprint: document.getElementById('editFingerprint').value,
          message: document.getElementById('editMessage').value,
          notes: document.getElementById('editNotes').value
        })
      }).then(r => {
        if (r.ok) location.reload();
        else alert('Erro ao salvar');
      });
    };

    document.getElementById('editModal').onclick = function(e) {
      if (e.target === this) closeModal();
    };

    document.onkeydown = function(e) {
      if (e.key === 'Escape') closeModal();
    };

    // Auto refresh every 30s
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>
`;
// Helper functions
function getTimeAgo(date) {
    const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
    if (seconds < 60)
        return 'agora mesmo';
    if (seconds < 3600)
        return `${Math.floor(seconds / 60)} min atrás`;
    if (seconds < 86400)
        return `${Math.floor(seconds / 3600)}h atrás`;
    return `${Math.floor(seconds / 86400)} dias atrás`;
}
function isOnline(lastSeen) {
    return Date.now() - new Date(lastSeen).getTime() < 600000;
}
function formatDate(date) {
    return new Date(date).toLocaleDateString('pt-BR');
}
function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
async function startControlServer() {
    const fastify = Fastify({ logger: false });
    await fastify.register(cors, { origin: true, credentials: true });
    await fastify.register(cookie);
    await fastify.register(formbody);
    // Auth middleware for protected routes
    const requireAuth = async (request, reply) => {
        const token = request.cookies?.session_token;
        if (!token || !verifySession(token)) {
            return reply.redirect('/login');
        }
    };
    // ========== AUTH ROUTES ==========
    fastify.get('/login', async (request, reply) => {
        const token = request.cookies?.session_token;
        if (token && verifySession(token)) {
            return reply.redirect('/dashboard');
        }
        return reply.type('text/html').send(loginPage());
    });
    fastify.post('/auth/login', async (request, reply) => {
        const body = request.body;
        const username = body?.username;
        const password = body?.password;
        if (username === ADMIN_USER && password === ADMIN_PASS) {
            const token = generateToken();
            const session = {
                token,
                userId: 'admin',
                createdAt: new Date(),
                expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
            };
            sessions.set(token, session);
            reply.setCookie('session_token', token, {
                path: '/',
                httpOnly: true,
                maxAge: 24 * 60 * 60
            });
            return reply.redirect('/dashboard');
        }
        return reply.type('text/html').send(loginPage('Usuário ou senha incorretos'));
    });
    fastify.get('/auth/logout', async (request, reply) => {
        const token = request.cookies?.session_token;
        if (token) {
            sessions.delete(token);
        }
        reply.clearCookie('session_token', { path: '/' });
        return reply.redirect('/login');
    });
    // ========== DASHBOARD ==========
    fastify.get('/', async (request, reply) => {
        return reply.redirect('/login');
    });
    fastify.get('/dashboard', async (request, reply) => {
        await requireAuth(request, reply);
        if (reply.sent)
            return;
        const systemList = Array.from(systems.values()).sort((a, b) => new Date(b.lastSeen).getTime() - new Date(a.lastSeen).getTime());
        return reply.type('text/html').send(dashboardPage(systemList));
    });
    // Legacy route redirect
    fastify.get('/admin', async (request, reply) => {
        return reply.redirect('/dashboard');
    });
    // ========== ADMIN API ==========
    fastify.post('/api/admin/toggle', async (request, reply) => {
        const token = request.cookies?.session_token;
        if (!token || !verifySession(token)) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const { fingerprint, active } = request.body;
        const system = systems.get(fingerprint);
        if (system) {
            system.active = active;
            return reply.send({ ok: true });
        }
        return reply.status(404).send({ error: 'System not found' });
    });
    fastify.post('/api/admin/update', async (request, reply) => {
        const token = request.cookies?.session_token;
        if (!token || !verifySession(token)) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        const { fingerprint, message, notes } = request.body;
        const system = systems.get(fingerprint);
        if (system) {
            system.message = message || '';
            system.notes = notes || '';
            return reply.send({ ok: true });
        }
        return reply.status(404).send({ error: 'System not found' });
    });
    fastify.get('/api/admin/systems', async (request, reply) => {
        const token = request.cookies?.session_token;
        if (!token || !verifySession(token)) {
            return reply.status(401).send({ error: 'Unauthorized' });
        }
        return reply.send(Array.from(systems.values()));
    });
    // ========== PUBLIC API (for clients) ==========
    fastify.post('/api/sys/report', async (request, reply) => {
        const body = request.body;
        if (!body.f || !body.h) {
            return reply.status(400).send({ error: 'Invalid' });
        }
        const fp = body.f;
        const clientIp = request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
            request.headers['x-real-ip'] ||
            request.ip || 'unknown';
        const existing = systems.get(fp);
        if (existing) {
            existing.lastSeen = new Date();
            existing.ip = clientIp;
            existing.uptime = body.u || 0;
            existing.version = body.v || existing.version;
            existing.environment = body.n || existing.environment;
            existing.totalInstances = body.ti || existing.totalInstances || 0;
            existing.connectedInstances = body.ci || existing.connectedInstances || 0;
            existing.totalUsers = body.tu || existing.totalUsers || 0;
            existing.totalMessages = body.tm || existing.totalMessages || 0;
        }
        else {
            systems.set(fp, {
                fingerprint: fp,
                hostname: body.h,
                ip: clientIp,
                firstSeen: new Date(),
                lastSeen: new Date(),
                version: body.v || 'unknown',
                environment: body.n || 'unknown',
                uptime: body.u || 0,
                active: true,
                message: '',
                notes: '',
                totalInstances: body.ti || 0,
                connectedInstances: body.ci || 0,
                totalUsers: body.tu || 0,
                totalMessages: body.tm || 0
            });
        }
        return reply.send({ ok: true });
    });
    fastify.get('/api/sys/status/:fingerprint', async (request, reply) => {
        const { fingerprint } = request.params;
        const system = systems.get(fingerprint);
        if (!system) {
            return reply.send({ active: true, message: '' });
        }
        return reply.send({ active: system.active, message: system.message });
    });
    // Start
    try {
        await fastify.listen({ port: 5353, host: '0.0.0.0' });
        console.log('\x1b[36m[Control]\x1b[0m Panel running on http://localhost:5353/login');
    }
    catch (err) {
        console.error('Control server error:', err);
    }
}
export { startControlServer };

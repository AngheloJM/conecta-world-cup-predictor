// ============================================================
//  PANTALLA DE LOGIN / REGISTRO (overlay)
//  Depende de: api.js (Auth, api), main.js (toast)
// ============================================================

const authView = document.getElementById('view-auth');
const authForm = document.getElementById('auth-form');
const authError = document.getElementById('auth-error');
const fieldNombre = document.getElementById('field-nombre');
const fieldEquipo = document.getElementById('field-equipo');
const authSubmit = document.getElementById('auth-submit');
const tabLogin = document.getElementById('tab-login');
const tabRegister = document.getElementById('tab-register');
const userArea = document.getElementById('user-area');
const userName = document.getElementById('user-name');

let authMode = 'login';

function setAuthMode(mode) {
  authMode = mode;
  const isLogin = mode === 'login';
  fieldNombre.classList.toggle('hidden', isLogin);
  fieldEquipo.classList.toggle('hidden', isLogin);
  document.getElementById('auth-nombre').required = !isLogin;
  authSubmit.textContent = isLogin ? 'Ingresar' : 'Crear cuenta';
  tabLogin.classList.toggle('bg-acento', isLogin);
  tabLogin.classList.toggle('text-white', isLogin);
  tabLogin.classList.toggle('text-blue-200', !isLogin);
  tabRegister.classList.toggle('bg-acento', !isLogin);
  tabRegister.classList.toggle('text-white', !isLogin);
  tabRegister.classList.toggle('text-blue-200', isLogin);
  hideError();
}
function showError(msg) { authError.textContent = msg; authError.classList.remove('hidden'); }
function hideError() { authError.classList.add('hidden'); }

function showAuth() {
  authView.classList.remove('hidden');
  userArea.classList.add('hidden');
  userArea.classList.remove('flex');
  document.getElementById('save-btn').disabled = true;
}
function enterApp(user) {
  authView.classList.add('hidden');
  userArea.classList.remove('hidden');
  userArea.classList.add('flex');
  userName.textContent = user.nombre;
  document.getElementById('save-btn').disabled = false;
  loadUserPrediction();
}

// Trae la predicción guardada del usuario y la pinta (si existe).
// Sólo tras terminar habilita el auto-guardado (predReady), para no pisar lo guardado.
async function loadUserPrediction() {
  predReady = false;
  try {
    await dataReadyPromise;          // espera a que los grupos reales estén construidos
    const sim = await api.getSimulacion();
    if (sim && sim.estructura_bracket_json) {
      applyState(sim.estructura_bracket_json);
      refreshAllFromState();
    }
  } catch (_) { /* sin predicción previa o sin conexión */ }
  finally { predReady = true; }
}

tabLogin.addEventListener('click', () => setAuthMode('login'));
tabRegister.addEventListener('click', () => setAuthMode('register'));

authForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  hideError();
  authSubmit.disabled = true;
  const prev = authSubmit.textContent;
  authSubmit.textContent = 'Procesando…';

  const email = document.getElementById('auth-email').value.trim();
  const password = document.getElementById('auth-password').value;

  try {
    let resp;
    if (authMode === 'login') {
      resp = await api.login({ email, password });
    } else {
      resp = await api.register({
        nombre: document.getElementById('auth-nombre').value.trim(),
        email,
        password,
        nombre_equipo: document.getElementById('auth-equipo').value.trim() || null,
      });
    }
    Auth.set(resp.token, resp.usuario);
    enterApp(resp.usuario);
    authForm.reset();
    toast(`¡Bienvenido, ${resp.usuario.nombre}! 👋`);
  } catch (err) {
    showError(err.message);
  } finally {
    authSubmit.disabled = false;
    authSubmit.textContent = prev;
  }
});

document.getElementById('logout-btn').addEventListener('click', () => {
  Auth.clear();
  showAuth();
  setAuthMode('login');
  toast('Sesión cerrada');
});

// Al cargar: si hay token, validarlo con /me; si no, mostrar login.
(async function checkSession() {
  setAuthMode('login');
  if (!Auth.token()) { showAuth(); return; }
  try {
    const u = await api.me();
    Auth.set(Auth.token(), u);
    enterApp(u);
  } catch (_) {
    Auth.clear();
    showAuth();
  }
})();

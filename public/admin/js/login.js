document.addEventListener('DOMContentLoaded', () => {
  if (localStorage.getItem('admin_token')) {
    window.location.href = '/admin/dashboard.html';
    return;
  }

  const form = document.getElementById('formLogin');
  const btnLogin = document.getElementById('btnLogin');
  const errorDiv = document.getElementById('errorLogin');
  const togglePass = document.getElementById('togglePass');
  const inputPass = document.getElementById('contrasena');

  togglePass.addEventListener('click', () => {
    const tipo = inputPass.type === 'password' ? 'text' : 'password';
    inputPass.type = tipo;
    togglePass.innerHTML = `<i class="fas fa-eye${tipo === 'password' ? '' : '-slash'}"></i>`;
  });

  function mostrarError(msg) {
    errorDiv.textContent = msg;
    errorDiv.hidden = false;
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    errorDiv.hidden = true;
    btnLogin.disabled = true;
    btnLogin.querySelector('.spinner').hidden = false;
    btnLogin.querySelector('.btn-text').textContent = 'Verificando...';

    try {
      const res = await fetch('/admin/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usuario: document.getElementById('usuario').value.trim(),
          contrasena: document.getElementById('contrasena').value.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'No se pudo iniciar sesión');

      localStorage.setItem('admin_token', data.token);
      localStorage.setItem('admin_usuario', data.usuario);
      window.location.href = '/admin/dashboard.html';
    } catch (err) {
      mostrarError(err.message || 'Error de conexión con el servidor');
      btnLogin.disabled = false;
      btnLogin.querySelector('.spinner').hidden = true;
      btnLogin.querySelector('.btn-text').textContent = 'Entrar';
    }
  });
});
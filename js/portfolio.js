(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const role = document.getElementById('typed-role');
  const roles = ['student.', 'volunteer.', 'builder.', 'enthusiast.', 'explorer.'];
  let roleIndex = 0;
  let character = roles[0].length;
  let deleting = true;
  let timer;

  function type() {
    const word = roles[roleIndex];
    document.getElementById('role-article').textContent = /^[aeiou]/i.test(word) ? 'an' : 'a';
    character += deleting ? -1 : 1;
    role.textContent = word.slice(0, character);
    let delay = deleting ? 45 : 95;
    if (!deleting && character === word.length) {
      deleting = true;
      delay = 1900;
    } else if (deleting && character === 0) {
      deleting = false;
      roleIndex = (roleIndex + 1) % roles.length;
      delay = 300;
    }
    timer = window.setTimeout(type, delay);
  }

  function syncMotion() {
    window.clearTimeout(timer);
    roleIndex = 0;
    character = roles[0].length;
    deleting = true;
    role.textContent = roles[0];
    document.getElementById('role-article').textContent = 'a';
    if (!reducedMotion.matches && !document.hidden) timer = window.setTimeout(type, 1900);
  }
  reducedMotion.addEventListener('change', syncMotion);
  document.addEventListener('visibilitychange', syncMotion);
  syncMotion();

  document.getElementById('year').textContent = new Date().getFullYear();
  if ('IntersectionObserver' in window && !reducedMotion.matches) {
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          entry.target.classList.add('visible');
          observer.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    document.documentElement.classList.add('motion-ready');
    document.querySelectorAll('.reveal').forEach(element => observer.observe(element));
  }
})();

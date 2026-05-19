import { createApp } from 'vue';
import App from './App.vue';

function mount() {
  createApp(App).mount('#app');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(mount, 100));
} else {
  setTimeout(mount, 100);
}

import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { clickOutside } from './directives/clickOutside'

// 动态加载 PUA 字体（支持 base 路径）
const base = import.meta.env.BASE_URL
const font = new FontFace('CHS-PUA', `url(${base}data/CHS_PUA-Regular.woff2)`)
font.load().then(() => {
  document.fonts.add(font)
}).catch((e) => {
  console.warn('Failed to load CHS-PUA font:', e)
})

const app = createApp(App)
app.directive('click-outside', clickOutside)
app.mount('#app')

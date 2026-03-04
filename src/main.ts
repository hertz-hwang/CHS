import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { clickOutside } from './directives/clickOutside'

const app = createApp(App)
app.directive('click-outside', clickOutside)
app.mount('#app')

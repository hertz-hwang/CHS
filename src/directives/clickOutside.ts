import type { Directive } from 'vue'

// 点击外部指令
export const clickOutside: Directive = {
  mounted(el, binding) {
    el._clickOutside = (event: Event) => {
      if (!(el === event.target || el.contains(event.target as Node))) {
        binding.value()
      }
    }
    document.addEventListener('click', el._clickOutside)
  },
  unmounted(el) {
    if (el._clickOutside) {
      document.removeEventListener('click', el._clickOutside)
    }
  }
}

// 声明类型扩展
declare module '@vue/runtime-core' {
  interface Element {
    _clickOutside?: (event: Event) => void
  }
}
// Which look the app is drawn in. The Ahead look (web/ui/ahead.css) is the owner's dark redesign; app.js puts
// `ahead` on the root when it is on. A screen whose layout differs in it (not only its colours) asks here.
export const ahead = () => typeof document !== 'undefined' && document.documentElement.classList.contains('ahead');

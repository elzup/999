/// <reference types="vite-plugin-pwa/client" />
import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import './style.css'

// registerType: 'autoUpdate' を実効化する配線。新しい SW (新 build) を検出したら
// 即リロードして最新に追従する。これが無いと script 注入 (registerSW.js) だけでは
// 検出しても開いているページが旧コードのまま残る。dev では stub なので no-op。
// クイズの入力途中状態は残さない設計なので、リロードで失うものは無い前提。
registerSW({ immediate: true })

render(<App />, document.getElementById('app')!)

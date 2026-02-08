/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly PROD: boolean
  readonly DEV: boolean
  readonly MODE: string
  readonly VITE_API_URL?: string
  readonly VITE_META_APP_ID?: string
  readonly VITE_META_CONFIG_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

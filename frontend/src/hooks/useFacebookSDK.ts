import { useState, useCallback, useEffect } from 'react'

declare global {
  interface Window {
    FB: {
      init: (params: {
        appId: string
        autoLogAppEvents?: boolean
        xfbml?: boolean
        version: string
      }) => void
      login: (
        callback: (response: FacebookLoginResponse) => void,
        options?: FacebookLoginOptions
      ) => void
      getLoginStatus: (callback: (response: FacebookLoginResponse) => void) => void
    }
    fbAsyncInit: () => void
  }
}

interface FacebookLoginResponse {
  status: 'connected' | 'not_authorized' | 'unknown'
  authResponse?: {
    accessToken?: string
    code?: string
    userID?: string
    expiresIn?: number
    signedRequest?: string
  }
}

interface FacebookLoginOptions {
  config_id?: string
  response_type?: string
  override_default_response_type?: boolean
  extras?: {
    setup?: Record<string, unknown>
    featureType?: string
    sessionInfoVersion?: string
  }
  scope?: string
}

export interface EmbeddedSignupResult {
  code: string
  wabaId?: string
  phoneNumberId?: string
}

interface UseFacebookSDKReturn {
  isSDKLoaded: boolean
  isLoading: boolean
  error: string | null
  startCoexistenceSignup: (configId: string) => Promise<EmbeddedSignupResult>
  initSDK: () => void
}

export function useFacebookSDK(): UseFacebookSDKReturn {
  const [isSDKLoaded, setIsSDKLoaded] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initSDK = useCallback(() => {
    const appId = import.meta.env.VITE_META_APP_ID

    if (!appId) {
      console.error('[FB SDK] VITE_META_APP_ID not configured')
      setError('Meta App ID not configured')
      return
    }

    if (!window.FB) {
      console.error('[FB SDK] Facebook SDK not loaded')
      setError('Facebook SDK not loaded')
      return
    }

    try {
      window.FB.init({
        appId,
        autoLogAppEvents: true,
        xfbml: true,
        version: 'v21.0',
      })
      setIsSDKLoaded(true)
      setError(null)
      console.log('[FB SDK] Initialized successfully with App ID:', appId)
    } catch (err) {
      console.error('[FB SDK] Init error:', err)
      setError('Failed to initialize Facebook SDK')
    }
  }, [])

  useEffect(() => {
    // Check if SDK is already loaded
    if (window.FB) {
      initSDK()
      return
    }

    // Wait for SDK to load
    const originalFbAsyncInit = window.fbAsyncInit
    window.fbAsyncInit = function () {
      originalFbAsyncInit?.()
      initSDK()
    }

    // Cleanup
    return () => {
      if (originalFbAsyncInit) {
        window.fbAsyncInit = originalFbAsyncInit
      }
    }
  }, [initSDK])

  const startCoexistenceSignup = useCallback(
    (configId: string): Promise<EmbeddedSignupResult> => {
      return new Promise((resolve, reject) => {
        if (!window.FB) {
          const err = 'Facebook SDK not loaded'
          setError(err)
          reject(new Error(err))
          return
        }

        if (!configId) {
          const err = 'Config ID is required'
          setError(err)
          reject(new Error(err))
          return
        }

        setIsLoading(true)
        setError(null)

        console.log('[FB SDK] Starting Coexistence Embedded Signup with config:', configId)

        window.FB.login(
          (response: FacebookLoginResponse) => {
            setIsLoading(false)
            console.log('[FB SDK] Login response:', response)

            if (response.status === 'connected' && response.authResponse?.code) {
              const result: EmbeddedSignupResult = {
                code: response.authResponse.code,
                // wabaId and phoneNumberId may come from sessionInfo callback
                // or need to be extracted from subsequent API calls
                wabaId: undefined,
                phoneNumberId: undefined,
              }

              console.log('[FB SDK] Signup successful, code received')
              setError(null)
              resolve(result)
            } else {
              const err = response.status === 'not_authorized'
                ? 'User did not authorize the app'
                : 'Signup was cancelled or failed'
              console.error('[FB SDK] Signup failed:', err, response)
              setError(err)
              reject(new Error(err))
            }
          },
          {
            config_id: configId,
            response_type: 'code',
            override_default_response_type: true,
            extras: {
              setup: {},
              featureType: 'whatsapp_business_app_onboarding', // COEXISTENCE feature type
              sessionInfoVersion: '3',
            },
          }
        )
      })
    },
    []
  )

  return {
    isSDKLoaded,
    isLoading,
    error,
    startCoexistenceSignup,
    initSDK,
  }
}

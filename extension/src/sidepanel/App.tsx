import { useCallback, useEffect, useState } from 'react';
import {
  REQUEST_SELECTION,
  SELECTION_RESULT,
  isCapturedSelection,
  type CapturedSelection,
  type SelectionResponse,
  type BackendHealthStatus,
  type SimplifyState,
} from '../types/messages';
import { BackendClient, isHealthResponse } from '../services/backend';
import { DEFAULT_BACKEND_BASE_URL } from '../config/backend-url';
import './App.css';

const client = new BackendClient({ baseUrl: DEFAULT_BACKEND_BASE_URL });

type CaptureStatus = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

export default function App() {
  // --- Selection Capture State ---
  const [captureStatus, setCaptureStatus] = useState<CaptureStatus>('idle');
  const [selection, setSelection] = useState<CapturedSelection | null>(null);
  const [notice, setNotice] = useState<string>('Select text on a webpage to start learning.');

  // --- Backend Health State ---
  const [backendStatus, setBackendStatus] = useState<BackendHealthStatus>('checking');
  const [backendDetail, setBackendDetail] = useState<string>('');

  // --- Simplify State ---
  const [simplifyState, setSimplifyState] = useState<SimplifyState>({ status: 'idle' });
  const [copied, setCopied] = useState(false);

  // --- Selection Capture Logic ---
  const applySelectionResult = useCallback((result: SelectionResponse) => {
    if (result.success && isCapturedSelection(result.payload)) {
      setSelection(result.payload);
      setCaptureStatus('ready');
      setNotice('');
      // Reset simplify state when new selection arrives
      setSimplifyState({ status: 'idle' });
      setCopied(false);
    } else {
      const errorResult = result as Extract<SelectionResponse, { success: false }>;
      setSelection(null);
      setCaptureStatus(errorResult.reason === 'NO_SELECTION' ? 'empty' : 'error');
      setNotice(errorResult.message);
    }
  }, []);

  const requestSelection = useCallback(() => {
    setCaptureStatus('loading');
    chrome.runtime.sendMessage({ type: REQUEST_SELECTION }, (response: SelectionResponse) => {
      if (chrome.runtime.lastError || !response) {
        setCaptureStatus('error');
        setNotice('Could not reach the StudyLens background worker. Reload the extension.');
        return;
      }
      applySelectionResult(response);
    });
  }, [applySelectionResult]);

  const checkBackendHealth = useCallback(async () => {
    setBackendStatus('checking');
    setBackendDetail('');

    const result = await client.health();

    if (result.ok && isHealthResponse(result.data)) {
      setBackendStatus('connected');
      return;
    }

    setBackendStatus('offline');
    setBackendDetail(
      result.ok
        ? 'Backend responded, but the health payload was invalid.'
        : `${result.error.failure} — ${result.error.detail ?? result.error.message}`
    );
  }, []);

  // --- Simplify Workflow ---
  const handleSimplify = useCallback(async () => {
    if (!selection) return;

    setSimplifyState({ status: 'loading' });
    setCopied(false);

    try {
      const result = await client.process({
        action: 'simplify',
        text: selection.text,
        source: selection.source,
      });

      if (result.ok && result.data.success) {
        setSimplifyState({
          status: 'success',
          simplifiedText: result.data.result.text,
        });
      } else {
        const errorMsg = result.ok
          ? (result.data as any).error?.message ?? 'AI processing failed.'
          : result.error.message;
        setSimplifyState({ status: 'error', errorMessage: errorMsg });
      }
    } catch (err) {
      setSimplifyState({
        status: 'error',
        errorMessage: err instanceof Error ? err.message : 'Unexpected error during simplification.',
      });
    }
  }, [selection]);

  const handleCopy = useCallback(async () => {
    if (!simplifyState.simplifiedText) return;
    try {
      await navigator.clipboard.writeText(simplifyState.simplifiedText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers or non-HTTPS contexts
      const textarea = document.createElement('textarea');
      textarea.value = simplifyState.simplifiedText;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [simplifyState.simplifiedText]);

  // --- Effects ---
  useEffect(() => {
    // Listen for push updates from background (e.g., after toolbar click)
    const listener = (message: unknown) => {
      const m = message as { type?: string; result?: SelectionResponse };
      if (m?.type === SELECTION_RESULT && m.result) applySelectionResult(m.result);
    };
    chrome.runtime.onMessage.addListener(listener);

    // Initial capture attempt
    requestSelection();

    // Check backend health on mount
    checkBackendHealth();

    return () => chrome.runtime.onMessage.removeListener(listener);
  }, [applySelectionResult, requestSelection, checkBackendHealth]);

  // --- Render ---
  return (
    <div className="sl-container">
      {/* Header with Health Indicator */}
      <header className="sl-header">
        <span className="sl-logo" aria-hidden="true">◎</span>
        <h1>StudyLens</h1>
        <span
          className={`sl-health-badge sl-health-${backendStatus}`}
          title={
            backendStatus === 'checking'
              ? 'Checking backend...'
              : backendStatus === 'connected'
                ? 'Backend connected'
                : 'Backend offline'
          }
        >
          {backendStatus === 'checking' ? '⏳' : backendStatus === 'connected' ? '🟢' : '🔴'}
        </span>
      </header>

      {/* Backend Status Message */}
      {backendStatus === 'checking' && (
        <p className="sl-status" role="status">Checking backend connection...</p>
      )}

      {backendStatus === 'offline' && (
        <p className="sl-status sl-error" role="status">
          Backend offline at <code>{DEFAULT_BACKEND_BASE_URL}</code>
          {backendDetail && <><br /><strong>{backendDetail}</strong></>}
        </p>
      )}
            
      {backendStatus !== 'checking' && (
        <button className="sl-secondary" onClick={checkBackendHealth}>
          Re-check backend
        </button>
      )}

      {/* Selection Capture Section */}
      <section className="sl-section">
        <p className="sl-hint">Select text on a webpage to start learning.</p>

        <button
          className="sl-primary"
          onClick={requestSelection}
          disabled={captureStatus === 'loading'}
          aria-label="Capture current text selection"
        >
          {captureStatus === 'loading' ? 'Capturing…' : 'Capture selection'}
        </button>

        {captureStatus === 'loading' && (
          <p className="sl-status" role="status">Reading your selection…</p>
        )}

        {(captureStatus === 'empty' || captureStatus === 'error' || captureStatus === 'idle') && (
          <p
            className={captureStatus === 'error' ? 'sl-status sl-error' : 'sl-status'}
            role="status"
          >
            {notice}
          </p>
        )}

        {captureStatus === 'ready' && selection && (
          <div className="sl-card sl-selection-card" aria-label="Selected text">
            <div className="sl-meta">
              <span className="sl-badge">Selected text</span>
              <span className="sl-title" title={selection.source.pageTitle}>
                {selection.source.pageTitle}
              </span>
            </div>
            {selection.source.truncated && (
              <p className="sl-warn">Text was shortened to fit the 5000-character limit.</p>
            )}
            <div className="sl-text">{selection.text}</div>
            <div className="sl-actions">
              <span className="sl-count">{selection.text.length} characters</span>
              <button
                className="sl-secondary"
                onClick={() => {
                  setSelection(null);
                  setCaptureStatus('empty');
                  setNotice('Selection cleared. Select new text and capture again.');
                  setSimplifyState({ status: 'idle' });
                  setCopied(false);
                }}
                aria-label="Clear current selection"
              >
                Clear selection
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Simplify Section */}
      {captureStatus === 'ready' && selection && (
        <section className="sl-section sl-simplify-section">
          <h2 className="sl-section-title">Simplify</h2>

          {simplifyState.status === 'idle' && (
            <button
              className="sl-accent"
              onClick={handleSimplify}
              disabled={backendStatus !== 'connected'}
              aria-label="Simplify selected text"
            >
              Simplify this text
            </button>
          )}

          {simplifyState.status === 'loading' && (
            <div className="sl-loading" role="status">
              <span className="sl-spinner" aria-hidden="true">⟳</span>
              <span>Simplifying with AI...</span>
            </div>
          )}

          {simplifyState.status === 'error' && (
            <div className="sl-error-box" role="alert">
              <p className="sl-error-message">{simplifyState.errorMessage}</p>
              <button className="sl-retry" onClick={handleSimplify}>
                Retry
              </button>
            </div>
          )}

          {simplifyState.status === 'success' && simplifyState.simplifiedText && (
            <div className="sl-card sl-result-card" aria-label="Simplified text">
              <div className="sl-meta">
                <span className="sl-badge sl-badge-success">Simplified</span>
              </div>
              <div className="sl-text sl-result-text">{simplifyState.simplifiedText}</div>
              <div className="sl-actions">
                <span className="sl-count">{simplifyState.simplifiedText.length} characters</span>
                <button
                  className={`sl-copy ${copied ? 'sl-copied' : ''}`}
                  onClick={handleCopy}
                  aria-label={copied ? 'Copied!' : 'Copy simplified text'}
                >
                  {copied ? '✓ Copied!' : '📋 Copy'}
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
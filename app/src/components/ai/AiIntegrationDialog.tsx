import { invoke } from '@tauri-apps/api/core';
import { Check, Copy, Download, Eye, EyeOff, Loader2, Plug, RefreshCw, Sparkles, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { localizeAppError } from '../../i18n';
import type { AiProvider } from './aiSettings';

interface McpConnectionInfo {
  endpoint: string;
  access_token: string;
  codex_config: string;
}

interface AiIntegrationDialogProps {
  open: boolean;
  onClose: () => void;
  aiEnabled: boolean;
  aiProvider: AiProvider;
  isAiProviderAvailable: boolean;
  onAiEnabledChange: (enabled: boolean) => void;
  onAiProviderChange: (provider: AiProvider) => void;
}

export function AiIntegrationDialog({
  open,
  onClose,
  aiEnabled,
  aiProvider,
  isAiProviderAvailable,
  onAiEnabledChange,
  onAiProviderChange,
}: AiIntegrationDialogProps) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<McpConnectionInfo | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showToken, setShowToken] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [isRotateConfirmOpen, setIsRotateConfirmOpen] = useState(false);
  const [isRotating, setIsRotating] = useState(false);
  const [isInstallConfirmOpen, setIsInstallConfirmOpen] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [isInstalledInCodex, setIsInstalledInCodex] = useState(false);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setIsInstalledInCodex(false);
    invoke<McpConnectionInfo>('get_mcp_connection_info')
      .then(setInfo)
      .catch(reason => setError(localizeAppError(reason)));
  }, [open]);

  if (!open) return null;

  const copyValue = async (key: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(key);
      window.setTimeout(() => setCopied(current => current === key ? null : current), 1500);
    } catch (reason) {
      setError(localizeAppError(reason));
    }
  };

  const copyIcon = (key: string) => (
    copied === key ? <Check size={14} /> : <Copy size={14} />
  );

  const rotateToken = async () => {
    setIsRotating(true);
    setError(null);
    try {
      const nextInfo = await invoke<McpConnectionInfo>('rotate_mcp_access_token');
      setInfo(nextInfo);
      setShowToken(true);
      setCopied(null);
      setIsRotateConfirmOpen(false);
      setIsInstalledInCodex(false);
    } catch (reason) {
      setError(t('ai.rotateTokenFailed', { error: localizeAppError(reason) }));
    } finally {
      setIsRotating(false);
    }
  };

  const installIntoCodex = async () => {
    setIsInstalling(true);
    setError(null);
    try {
      await invoke('install_mcp_into_codex');
      setIsInstallConfirmOpen(false);
      setIsInstalledInCodex(true);
    } catch (reason) {
      setError(t('ai.installCodexFailed', { error: localizeAppError(reason) }));
    } finally {
      setIsInstalling(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black/55 flex items-center justify-center p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-integration-title"
        className="w-full max-w-2xl max-h-[86vh] bg-card border border-border shadow-2xl rounded-md flex flex-col overflow-hidden"
      >
        <header className="h-14 px-5 border-b border-border flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-2.5">
            <Plug size={18} className="text-primary" />
            <div>
              <h2 id="ai-integration-title" className="text-sm font-semibold">
                {t('ai.integrationTitle')}
              </h2>
              <p className="text-xs text-muted-foreground">{t('ai.integrationDescription')}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isRotating || isInstalling}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
            title={t('common.close')}
          >
            <X size={16} />
          </button>
        </header>

        <div className="p-5 overflow-y-auto space-y-5">
          <section className="rounded-md border border-border bg-background p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-2.5">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-primary" />
                <div>
                  <h3 className="text-sm font-medium">{t('ai.support')}</h3>
                  <p className="mt-1 text-xs leading-5 text-muted-foreground">
                    {t('ai.supportDescription')}
                  </p>
                </div>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={aiEnabled}
                  onChange={event => onAiEnabledChange(event.target.checked)}
                  className="h-4 w-4 accent-primary"
                />
                {t('ai.enableSupport')}
              </label>
            </div>

            <label className="mt-4 flex flex-col gap-1.5">
              <span className="text-xs font-medium">{t('ai.provider')}</span>
              <select
                value={aiProvider}
                onChange={event => onAiProviderChange(event.target.value as AiProvider)}
                disabled={!aiEnabled}
                className="h-9 rounded border border-border bg-card px-2.5 text-sm outline-none focus:ring-1 focus:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
              >
                <option value="codex">Codex</option>
              </select>
            </label>

            <p className={`mt-2 text-xs ${aiEnabled && !isAiProviderAvailable ? 'text-amber-600 dark:text-amber-400' : 'text-muted-foreground'}`}>
              {!aiEnabled
                ? t('ai.supportDisabled')
                : isAiProviderAvailable
                  ? t('ai.providerAvailable', { provider: 'Codex' })
                  : t('ai.providerUnavailable', { provider: 'Codex' })}
            </p>
          </section>

          <section className="border-t border-border pt-5">
            <div className="mb-4 flex items-start gap-2.5">
              <Plug size={16} className="mt-0.5 shrink-0 text-muted-foreground" />
              <div>
                <h3 className="text-sm font-medium">{t('ai.mcpTitle')}</h3>
                <p className="mt-1 text-xs leading-5 text-muted-foreground">{t('ai.mcpDescription')}</p>
              </div>
            </div>

            {!info && !error && (
              <div className="h-24 flex items-center justify-center text-muted-foreground">
                <Loader2 size={20} className="animate-spin" />
              </div>
            )}

            {error && (
              <div className="text-xs text-red-500 border border-red-500/30 bg-red-500/10 rounded p-3">
                {t('ai.connectionFailed', { error })}
              </div>
            )}

            {info && (
              <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium">{t('ai.endpoint')}</label>
                  <button
                    type="button"
                    onClick={() => copyValue('endpoint', info.endpoint)}
                    className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                    title={t('ai.copy')}
                  >
                    {copyIcon('endpoint')}
                  </button>
                </div>
                <input
                  readOnly
                  value={info.endpoint}
                  className="w-full h-9 rounded border border-border bg-muted/30 px-3 font-mono text-xs outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium">{t('ai.accessToken')}</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setShowToken(current => !current)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title={showToken ? t('ai.hideToken') : t('ai.showToken')}
                    >
                      {showToken ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyValue('token', info.access_token)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title={t('ai.copy')}
                    >
                      {copyIcon('token')}
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsRotateConfirmOpen(true)}
                      disabled={isRotating}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground disabled:opacity-50"
                      title={t('ai.rotateToken')}
                    >
                      <RefreshCw size={14} className={isRotating ? 'animate-spin' : undefined} />
                    </button>
                  </div>
                </div>
                <input
                  readOnly
                  type={showToken ? 'text' : 'password'}
                  value={info.access_token}
                  className="w-full h-9 rounded border border-border bg-muted/30 px-3 font-mono text-xs outline-none"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-medium">{t('ai.codexConfig')}</label>
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setIsInstallConfirmOpen(true)}
                      disabled={isInstalling}
                      className="h-7 px-2 rounded border border-border text-xs font-medium flex items-center gap-1.5 hover:bg-muted disabled:opacity-50"
                    >
                      {isInstalling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                      {isInstalling ? t('ai.installingToCodex') : t('ai.installToCodex')}
                    </button>
                    <button
                      type="button"
                      onClick={() => copyValue('config', info.codex_config)}
                      className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
                      title={t('ai.copy')}
                    >
                      {copyIcon('config')}
                    </button>
                  </div>
                </div>
                <textarea
                  readOnly
                  value={info.codex_config}
                  className="w-full h-28 resize-none rounded border border-border bg-muted/30 p-3 font-mono text-xs outline-none"
                />
                {isInstalledInCodex && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-emerald-600">
                    <Check size={14} />
                    {t('ai.installedInCodex')}
                  </p>
                )}
              </div>

              <p className="text-xs text-muted-foreground leading-5">
                {t('ai.securityNote')}
              </p>
              </div>
            )}
          </section>
        </div>
      </section>

      {isRotateConfirmOpen && (
        <div className="fixed inset-0 z-[110] bg-black/55 flex items-center justify-center p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="rotate-mcp-token-title"
            className="w-full max-w-md bg-card border border-border shadow-2xl rounded-md overflow-hidden"
          >
            <header className="px-5 pt-5">
              <h3 id="rotate-mcp-token-title" className="text-sm font-semibold">
                {t('ai.rotateTokenTitle')}
              </h3>
            </header>
            <div className="px-5 pt-2 pb-5">
              <p className="text-sm text-muted-foreground leading-6">
                {t('ai.rotateTokenDescription')}
              </p>
            </div>
            <footer className="px-5 py-3 border-t border-border flex justify-end gap-2 bg-muted/20">
              <button
                type="button"
                onClick={() => setIsRotateConfirmOpen(false)}
                disabled={isRotating}
                className="h-8 px-3 rounded border border-border text-xs hover:bg-muted disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={rotateToken}
                disabled={isRotating}
                className="h-8 px-3 rounded bg-destructive text-destructive-foreground text-xs font-medium flex items-center gap-1.5 hover:bg-destructive/90 disabled:opacity-50"
              >
                {isRotating ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                {isRotating ? t('ai.rotatingToken') : t('ai.rotateTokenConfirm')}
              </button>
            </footer>
          </section>
        </div>
      )}

      {isInstallConfirmOpen && (
        <div className="fixed inset-0 z-[120] bg-black/55 flex items-center justify-center p-6">
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="install-codex-mcp-title"
            className="w-full max-w-md bg-card border border-border shadow-2xl rounded-md overflow-hidden"
          >
            <header className="px-5 pt-5">
              <h3 id="install-codex-mcp-title" className="text-sm font-semibold">
                {t('ai.installCodexTitle')}
              </h3>
            </header>
            <div className="px-5 pt-2 pb-5">
              <p className="text-sm text-muted-foreground leading-6">
                {t('ai.installCodexDescription')}
              </p>
            </div>
            <footer className="px-5 py-3 border-t border-border flex justify-end gap-2 bg-muted/20">
              <button
                type="button"
                onClick={() => setIsInstallConfirmOpen(false)}
                disabled={isInstalling}
                className="h-8 px-3 rounded border border-border text-xs hover:bg-muted disabled:opacity-50"
              >
                {t('common.cancel')}
              </button>
              <button
                type="button"
                onClick={installIntoCodex}
                disabled={isInstalling}
                className="h-8 px-3 rounded bg-primary text-primary-foreground text-xs font-medium flex items-center gap-1.5 hover:bg-primary/90 disabled:opacity-50"
              >
                {isInstalling ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
                {isInstalling ? t('ai.installingToCodex') : t('ai.installCodexConfirm')}
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}

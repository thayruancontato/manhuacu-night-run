import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';

interface DialogState {
  type: 'alert' | 'confirm';
  message: string;
  severity?: 'success' | 'error' | 'warning' | 'info';
  image?: string;
  onConfirm?: () => void;
}

interface DialogContextType {
  showAlert: (message: string, severity?: string, image?: string) => void;
  showConfirm: (message: string, onConfirm: () => void) => void;
}

const DialogContext = createContext<DialogContextType>({
  showAlert: () => {},
  showConfirm: () => {},
});

export const useDialog = () => useContext(DialogContext);

export function CustomDialogProvider({ children }: { children: React.ReactNode }) {
  const [dialog, setDialog] = useState<DialogState | null>(null);

  const showAlert = useCallback((message: string, severity?: string, image?: string) => {
    setDialog({ type: 'alert', message, severity: (severity as any) || 'info', image });
  }, []);

  const showConfirm = useCallback((message: string, onConfirm: () => void) => {
    setDialog({ type: 'confirm', message, onConfirm });
  }, []);

  const close = () => setDialog(null);
  const confirm = () => {
    dialog?.onConfirm?.();
    close();
  };

  useEffect(() => {
    if (!dialog) return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        close();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dialog]);

  const colors: Record<string, string> = {
    success: '#27ae60',
    error: '#e74c3c',
    warning: '#f39c12',
    info: '#071A45',
  };

  return (
    <DialogContext.Provider value={{ showAlert, showConfirm }}>
      {children}
      {dialog && (
        <div className="modal-overlay" onClick={close}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 420, textAlign: 'center' }}>
            <div
              style={{
                width: 50,
                height: 50,
                borderRadius: '50%',
                margin: '0 auto 16px',
                background: colors[dialog.severity || 'info'] || colors.info,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#fff',
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              {dialog.severity === 'success' ? '✓' : dialog.severity === 'error' ? '✕' : dialog.severity === 'warning' ? '!' : 'i'}
            </div>
            <p style={{ fontSize: '1rem', color: '#333', lineHeight: 1.6, marginBottom: 24 }}>{dialog.message}</p>
            {dialog.image && (
              <div style={{ marginBottom: 24, borderRadius: 12, overflow: 'hidden', border: '1px solid #eee' }}>
                <img src={dialog.image} alt="Exemplo" style={{ width: '100%', display: 'block' }} />
              </div>
            )}
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
              {dialog.type === 'confirm' && (
                <button className="btn btn-outline" onClick={close}>Cancelar</button>
              )}
              <button
                className="btn btn-primary"
                onClick={dialog.type === 'confirm' ? confirm : close}
              >
                {dialog.type === 'confirm' ? 'Confirmar' : 'OK'}
              </button>
            </div>
          </div>
        </div>
      )}
    </DialogContext.Provider>
  );
}

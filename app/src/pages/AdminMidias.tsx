import { useState, useEffect } from 'react';
import { Upload, Trash2, Copy, Image as ImageIcon } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { useDialog } from '../context/CustomDialogContext';

export default function AdminMidias() {
  const [files, setFiles] = useState<any[]>([]);
  const [uploading, setUploading] = useState(false);
  const { showAlert, showConfirm } = useDialog();
  const workerUrl = import.meta.env.VITE_WORKER_URL;

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) return showAlert('Arquivo muito grande (máx 5MB).', 'warning');
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file, file.name);
      const r = await fetch(`${workerUrl}/media/upload`, { method: 'POST', body: fd });
      const d = await r.json();
      if (d.url) {
        setFiles(prev => [{ url: d.url, name: file.name, key: d.key, uploadedAt: new Date().toISOString() }, ...prev]);
        showAlert('Upload realizado!', 'success');
      }
    } catch (err: any) { showAlert('Erro: ' + err.message, 'error'); }
    finally { setUploading(false); e.target.value = ''; }
  };

  const copyUrl = (url: string) => {
    navigator.clipboard.writeText(url);
    showAlert('URL copiada!', 'success');
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Central de Mídias</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Upload e gerenciamento de imagens e vídeos via Cloudflare R2</p>
        </div>
      </div>

      <div style={{ background: '#fff', padding: 40, borderRadius: 24, border: '1px solid #e2e8f0', textAlign: 'center', marginBottom: 32 }}>
        <label style={{ cursor: 'pointer', display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 64, height: 64, borderRadius: 16, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '2px dashed #cbd5e1' }}>
            <Upload size={32} color="#071A45" />
          </div>
          <div>
            <p style={{ fontWeight: 800, color: '#071A45', fontSize: '1rem' }}>{uploading ? 'ENVIANDO ARQUIVO...' : 'CLIQUE PARA ENVIAR MÍDIA'}</p>
            <p style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>JPG, PNG, GIF, MP4 (MÁX 5MB)</p>
          </div>
          <input type="file" accept="image/*,video/*" onChange={handleUpload} style={{ display: 'none' }} disabled={uploading} />
        </label>
      </div>

      {files.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: 24 }}>
          {files.map((f, i) => (
            <div key={i} style={{ background: '#fff', borderRadius: 20, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
              <div style={{ height: 180, background: '#f8fafc', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {f.url.match(/\.(mp4|webm)/i) ? (
                  <video src={f.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} controls />
                ) : (
                  <img src={f.url} alt={f.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => (e.target as any).style.display = 'none'} />
                )}
              </div>
              <div style={{ padding: 16 }}>
                <p style={{ fontSize: '0.8rem', fontWeight: 700, color: '#071A45', marginBottom: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    onClick={() => copyUrl(f.url)} 
                    style={{ flex: 1, background: '#f1f5f9', border: 'none', padding: '8px', borderRadius: 8, color: '#475569', fontWeight: 800, fontSize: '0.7rem', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, cursor: 'pointer' }}
                  >
                    <Copy size={14} /> COPIAR
                  </button>
                  <a 
                    href={f.url} 
                    target="_blank" 
                    rel="noreferrer"
                    style={{ flex: 1, background: '#071A45', color: '#fff', border: 'none', padding: '8px', borderRadius: 8, fontWeight: 800, fontSize: '0.7rem', textDecoration: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                  >
                    VER
                  </a>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {files.length === 0 && (
        <div style={{ textAlign: 'center', padding: 80, background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0' }}>
          <ImageIcon size={48} color="#cbd5e1" style={{ marginBottom: 16 }} />
          <p style={{ color: '#64748b', fontWeight: 600 }}>Nenhuma mídia enviada nesta sessão.</p>
        </div>
      )}
    </div>
  );
}

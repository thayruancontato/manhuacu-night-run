import { useState, useEffect } from 'react';
import { collection, getDocs, query, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { formatDateTimeBR } from '../utils/dateUtils';

export default function AdminMensagensHistorico() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const q = query(collection(db, 'whatsapp_logs'), orderBy('dataHora', 'desc'), limit(200));
        const snap = await getDocs(q);
        setLogs(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      } catch {} finally { setLoading(false); }
    })();
  }, []);

  return (
    <PageContainer>
      <PageTitle title="HISTÓRICO DE MENSAGENS" subtitle={`${logs.length} mensagens registradas`} />
      <div className="data-card">
        <div style={{ overflowX: 'auto', maxHeight: 600, overflowY: 'auto' }}>
          <table className="data-table">
            <thead><tr><th>Data/Hora</th><th>Destinatário</th><th>Tipo</th><th>Status</th><th>Mensagem</th></tr></thead>
            <tbody>
              {loading ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40 }}>Carregando...</td></tr> :
                logs.length === 0 ? <tr><td colSpan={5} style={{ textAlign: 'center', padding: 40, color: '#999' }}>Nenhum log encontrado.</td></tr> :
                logs.map(l => (
                  <tr key={l.id}>
                    <td style={{ fontSize: '.8rem', whiteSpace: 'nowrap' }}>{l.dataHora ? formatDateTimeBR(l.dataHora) : '—'}</td>
                    <td style={{ fontFamily: 'monospace', fontSize: '.85rem' }}>{l.destinatario}</td>
                    <td><span className={`badge ${l.tipo === 'MEDIA' ? 'badge-info' : 'badge-primary'}`}>{l.tipo || 'TEXTO'}</span></td>
                    <td><span className={`badge ${l.status === 'SUCESSO' ? 'badge-success' : 'badge-danger'}`}>{l.status}</span></td>
                    <td style={{ maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '.85rem' }}>{l.mensagem.substring(0, 60)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>
    </PageContainer>
  );
}

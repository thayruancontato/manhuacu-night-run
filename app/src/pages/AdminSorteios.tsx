import { useState, useEffect } from 'react';
import { collection, getDocs, doc, setDoc, deleteDoc, query, orderBy } from 'firebase/firestore';
import { db } from '../firebase';
import { Gift, Plus, Edit, Trash2, Trophy, Eye, ToggleLeft, ToggleRight, UploadCloud, Download } from 'lucide-react';
import PageContainer from '../components/PageContainer';
import PageTitle from '../components/PageTitle';
import { useDialog } from '../context/CustomDialogContext';
import LoadingModal from '../components/LoadingModal';
import { FormField, FormLabel, FormInput, FormTextarea, FormSwitch, FormActions, FormSelect, FormGrid, Tabs, FormHeader } from '../components/AdminForm';
import WinnerExperience from '../components/WinnerExperience';
import { formatDateBR } from '../utils/dateUtils';
import '../App.css';

export default function AdminSorteios() {
  const [config, setConfig] = useState<any>(null);
  const [ganhadores, setGanhadores] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('config');
  const [simulating, setSimulating] = useState(false);
  const [simulatedAthlete, setSimulatedAthlete] = useState<any>(null);
  const [simulatedPrize, setSimulatedPrize] = useState<any>(null);
  const { showAlert } = useDialog();

  // Config Form
  const [frequencia, setFrequencia] = useState(50);
  const [tipoRegra, setTipoRegra] = useState<'frequencia' | 'especifico'>('frequencia');
  const [numerosEspecificos, setNumerosEspecificos] = useState('');
  const [instrucoes, setInstrucoes] = useState('');
  const [ativo, setAtivo] = useState(false);
  const [ganhoGarantido, setGanhoGarantido] = useState(false);
  const [premios, setPremios] = useState<any[]>([]);
  const [uploadingImage, setUploadingImage] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Prêmio Editing
  const [editingPremio, setEditingPremio] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      // Load Config
      const qConfig = query(collection(db, 'nightrun_sorteios_config'));
      const snapConfig = await getDocs(qConfig);
      
      if (!snapConfig.empty) {
        const docData = snapConfig.docs[0];
        const data = { id: docData.id, ...docData.data() } as any;
        setConfig(data);
        setFrequencia(data.frequencia || 50);
        setTipoRegra(data.tipoRegra || 'frequencia');
        setNumerosEspecificos(data.numerosEspecificos.join(', ') || '');
        setInstrucoes(data.instrucoes || '');
        setAtivo(data.ativo || false);
        setGanhoGarantido(data.ganhoGarantido || false);
        setPremios(data.premios || []);
      }

      // Load Winners
      const qGanhadores = query(collection(db, 'nightrun_sorteios_ganhadores'), orderBy('dataHora', 'desc'));
      const snapGanhadores = await getDocs(qGanhadores);
      setGanhadores(snapGanhadores.docs.map(d => ({ id: d.id, ...d.data() })));
      
    } catch (err) {
      console.error(err);
      showAlert('Erro ao carregar dados dos sorteios', 'error');
    } finally {
      setLoading(false);
    }
  };

  const saveConfig = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      const docId = config.id || 'regra_principal';
      const docRef = doc(db, 'nightrun_sorteios_config', docId);
      
      let parsedNumeros: number[] = [];
      if (tipoRegra === 'especifico') {
        parsedNumeros = numerosEspecificos.split(',').map(n => parseInt(n.trim(), 10)).filter(n => !isNaN(n) && n > 0);
        if (parsedNumeros.length === 0) {
          showAlert('Digite pelo menos um número válido.', 'error');
          setLoading(false);
          return;
        }
      }

      const payload = {
        tipoRegra,
        frequencia: Number(frequencia),
        numerosEspecificos: parsedNumeros,
        instrucoes,
        ativo,
        ganhoGarantido,
        premios,
        updatedAt: new Date().toISOString()
      };

      await setDoc(docRef, payload);
      showAlert('Configuração de sorteio salva com sucesso!', 'success');
      loadData();
    } catch (err) {
      console.error(err);
      showAlert('Erro ao salvar configuração', 'error');
    } finally {
      setLoading(false);
    }
  };

  const toggleAtivo = async () => {
    if (!config) return;
    try {
      setLoading(true);
      const docRef = doc(db, 'nightrun_sorteios_config', config.id);
      const novoStatus = !config.ativo;
      await setDoc(docRef, { ativo: novoStatus }, { merge: true });
      setConfig({ ...config, ativo: novoStatus });
      setAtivo(novoStatus);
      showAlert(`Sorteio ${novoStatus ? 'ativado' : 'desativado'} com sucesso!`, 'success');
    } catch (err) {
      console.error(err);
      showAlert('Erro ao alterar status', 'error');
    } finally {
      setLoading(false);
    }
  };

  const savePremios = async (novosPremios: any[]) => {
    try {
      const docId = config.id || 'regra_principal';
      const docRef = doc(db, 'nightrun_sorteios_config', docId);
      await setDoc(docRef, { premios: novosPremios }, { merge: true });
      setPremios(novosPremios);
      showAlert('Lista de prêmios atualizada!', 'success');
    } catch (e) {
      console.error(e);
      showAlert('Erro ao atualizar prêmios.', 'error');
    }
  };

  const handleSaveEditingPremio = () => {
    if (!editingPremio.nome.trim() || editingPremio.quantidade < 1) return;
    
    let atualizados = [];
    if (editingPremio.id === 'new') {
      const novo = {
        id: Date.now().toString(),
        nome: editingPremio.nome,
        quantidade: editingPremio.quantidade,
        imagem: editingPremio.imagem,
        ativo: editingPremio.ativo !== false,
        distribuidos: 0
      };
      atualizados = [...premios, novo];
    } else {
      atualizados = premios.map(p => p.id === editingPremio.id ? editingPremio : p);
    }
    
    savePremios(atualizados);
    setEditingPremio(null);
  };

  const handleRemovePremio = (idToRemove: string) => {
    if (window.confirm('Tem certeza que deseja remover este prêmio')) {
      const atualizados = premios.filter(p => p.id !== idToRemove);
      savePremios(atualizados);
      if (editingPremio && editingPremio.id === idToRemove) {
        setEditingPremio(null);
      }
    }
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingImage(true);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append("file", file);

    const xhr = new XMLHttpRequest();
    const workerUrl = import.meta.env.VITE_WORKER_URL;

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const progress = (event.loaded / event.total) * 100;
        setUploadProgress(progress);
      }
    };

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        try {
          const response = JSON.parse(xhr.responseText);
          if (response.url) {
            setEditingPremio({ ...editingPremio, imagem: response.url });
          } else {
            showAlert(response.error || 'Erro no upload.', 'error');
          }
        } catch (err) {
          showAlert('Erro ao ler resposta do servidor.', 'error');
        }
      } else {
        showAlert('Erro no servidor ao fazer upload.', 'error');
      }
      setUploadingImage(false);
      setUploadProgress(0);
    };

    xhr.onerror = () => {
      showAlert('Erro de conexão ao fazer upload.', 'error');
      setUploadingImage(false);
      setUploadProgress(0);
    };

    xhr.open("POST", `${workerUrl}/media/upload`, true);
    xhr.send(formData);
  };

  const generateRealisticAthlete = async () => {
    try {
      // 1. Get realistic photo from randomuser.me
      const personRes = await fetch('https://randomuser.me/api/nat=br');
      const personData = await personRes.json();
      const person = personData.results[0];
      
      // 2. Use Groq to generate a realistic Brazilian athlete name when configured locally.
      const groqApiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!groqApiKey) throw new Error('Groq API key not configured.');
      const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqApiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [{
            role: "user",
            content: "Gere um nome completo de um atleta brasileiro realista (homem ou mulher) para uma corrida de rua. Retorne APENAS o nome sem aspas ou texto extra."
          }],
          temperature: 0.9
        })
      });
      const groqData = await groqRes.json();
      const name = groqData.choices[0].message.content.trim().replace(/^"|"$/g, '');
      
      return {
        nome: name,
        foto: `https://images.weserv.nl/url=${encodeURIComponent(person.picture.large)}`
      };
    } catch (err) {
      console.error("Groq/Photo API error:", err);
      return {
        nome: "Ricardo Santos",
        foto: `https://randomuser.me/api/portraits/${Math.random() > 0.5 ? 'men' : 'women'}/${Math.floor(Math.random() * 50)}.jpg`
      };
    }
  };

  const handleSimulateWinner = async () => {
    const availablePrizes = premios.filter(p => p.ativo !== false && p.quantidade > (p.distribuidos || 0));
    if (availablePrizes.length === 0) {
      showAlert("Não há prêmios disponíveis no estoque para simular.", "error");
      return;
    }

    setLoading(true);
    let targetPhone = "";
    try {
      const res = await fetch(`${import.meta.env.VITE_WORKER_URL}/whatsapp/status`);
      const data = await res.json();
      let owner = data.instance.owner || data.instance.ownerJid || "";
      
      if (data.instance.state !== "open") {
        throw new Error("Instância do WhatsApp não está conectada.");
      }
      
      if (!owner) {
        try {
          const evoRes = await fetch('https://evolution-api-im3d.onrender.com/instance/fetchInstances', {
            headers: { apikey: 'd13aa39fa0a6cef73a15f3741bc2a441' }
          });
          const instances = await evoRes.json();
          const inst = instances.find((i: any) => i.name === data.instance.instanceName);
          if (inst && inst.ownerJid) {
            owner = inst.ownerJid;
          }
        } catch (e) {
          console.log("CORS block or error on evolution api direct fetch");
        }
      }

      if (!owner) {
        setLoading(false);
        const manualPhone = window.prompt("A API não retornou o número dono da instância. Digite seu número com DDD (ex: 5511999999999) para receber a simulação:");
        if (!manualPhone) return;
        owner = manualPhone;
      }

      targetPhone = owner.split("@")[0].replace(/\D/g, '');
      if (targetPhone.length < 10) targetPhone = "55";
    } catch (err: any) {
      setLoading(false);
      showAlert("Erro: " + err.message, "error");
      return;
    }
    setLoading(false);

    setSimulating(true);
    setSimulatedPrize(null);
    setSimulatedAthlete(null);
    
    // Generate athlete data in parallel with suspense
    const athleteData = await generateRealisticAthlete();
    setSimulatedAthlete(athleteData);

    const selectedPrize = availablePrizes[Math.floor(Math.random() * availablePrizes.length)];
    
    setTimeout(async () => {
      setSimulatedPrize(selectedPrize);
      
      try {
        await fetch(`${import.meta.env.VITE_WORKER_URL}/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            phone: targetPhone,
            text: `*[TESTE DE SORTEIO]*\n🎉 *PARABÉNS! ${athleteData.nome.toUpperCase()} GANHOU O SORTEIO SURPRESA!* 🎉\n\nOlá ${athleteData.nome.split(' ')[0]}, você simulou um pagamento e ganhou: *${selectedPrize.nome}*!\n\n${instrucoes}`,
            imageUrl: selectedPrize.imagem || undefined
          })
        });
      } catch (err) {
        console.error("Erro simulando disparo", err);
      }
      
      setTimeout(() => {
        setSimulating(false);
        setSimulatedPrize(null);
        showAlert(`Simulação concluída! WhatsApp enviado para ${targetPhone}`, "success");
      }, 4000);
    }, 2500);
  };

  if (loading && !config && ganhadores.length === 0) return <LoadingModal isOpen={true} />;

  const availablePrizesCount = premios.reduce((acc, p) => acc + (p.ativo !== false ? (p.quantidade - (p.distribuidos || 0)) : 0), 0);

  return (
    <div style={{ minHeight: '100vh', background: '#f1f5f9', color: '#071A45', padding: '24px 30px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28, flexWrap: 'wrap', gap: 20 }}>
        <div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: 900, color: '#071A45', marginBottom: 4 }}>Sorteio Surpresa</h1>
          <p style={{ color: '#64748b', fontWeight: 500 }}>Configure as regras e acompanhe os ganhadores em tempo real.</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 32 }}>
        <div style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#f1f5f9', color: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Gift size={26} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#071A45' }}>{availablePrizesCount}</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Prêmios em Estoque</p>
          </div>
        </div>
        <div style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <div style={{ width: 52, height: 52, borderRadius: 14, background: '#f1f5f9', color: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Trophy size={26} /></div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.6rem', fontWeight: 900, color: '#071A45' }}>{ganhadores.length}</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Ganhadores Totais</p>
          </div>
        </div>
        <div 
          onClick={toggleAtivo}
          style={{ background: '#fff', padding: 24, borderRadius: 24, border: '1px solid #e2e8f0', display: 'flex', alignItems: 'center', gap: 20, boxShadow: '0 1px 3px rgba(0,0,0,0.05)', cursor: 'pointer', transition: 'all 0.2s' }}
        >
          <div style={{ width: 52, height: 52, borderRadius: 14, background: config.ativo ? '#dcfce7' : '#fee2e2', color: config.ativo ? '#166534' : '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {config.ativo ? <ToggleRight size={30} /> : <ToggleLeft size={30} />}
          </div>
          <div>
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 900, color: config.ativo ? '#166534' : '#ef4444' }}>{config.ativo ? 'ATIVO' : 'DESATIVADO'}</h3>
            <p style={{ margin: 0, fontSize: '0.75rem', fontWeight: 800, color: '#64748b', textTransform: 'uppercase' }}>Status do Sorteio</p>
          </div>
        </div>
      </div>

      <div style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid #f1f5f9', padding: '0 20px', overflowX: 'auto', background: '#f8fafc' }}>
          {[
            { id: 'premios', label: 'PRÊMIOS', icon: <Gift size={18} /> },
            { id: 'config', label: 'REGRAS', icon: <Edit size={18} /> },
            { id: 'teste', label: 'SIMULAÇÃO', icon: <Eye size={18} /> },
            { id: 'ganhadores', label: 'GANHADORES', icon: <Trophy size={18} /> }
          ].map(tab => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10,
                background: 'transparent', border: 'none',
                padding: '18px 24px',
                color: activeTab === tab.id ? '#071A45' : '#94a3b8',
                fontWeight: 800, fontSize: '0.8rem',
                borderBottom: activeTab === tab.id ? '3px solid #6BFF2A' : '3px solid transparent',
                cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s'
              }}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>

        <div style={{ padding: '32px' }}>
          {activeTab === 'premios' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
                 <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45' }}>Pool de Prêmios</h3>
                 <button 
                   onClick={() => setEditingPremio({ id: 'new', nome: '', imagem: '', quantidade: 1, distribuidos: 0 })}
                   style={{ background: '#071A45', color: '#fff', border: 'none', padding: '10px 20px', borderRadius: 10, fontWeight: 800, fontSize: '0.8rem', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 8 }}
                 >
                   <Plus size={18} /> ADICIONAR PRÊMIO
                 </button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 20 }}>
                 {premios.map(p => {
                  const disponiveis = p.quantidade - (p.distribuidos || 0);
                  const isPrizeAtivo = p.ativo !== false;
                  return (
                    <div 
                      key={p.id}
                      onClick={() => setEditingPremio(p)}
                      style={{ 
                        background: '#fff', border: '1px solid #e2e8f0', borderRadius: 20, 
                        overflow: 'hidden', cursor: 'pointer', transition: 'all 0.2s',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.03)', opacity: isPrizeAtivo ? 1 : 0.6
                      }}
                    >
                      <div style={{ 
                        height: 140, 
                        background: p.imagem ? `url(${p.imagem}) center/cover` : '#f1f5f9', 
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {!p.imagem && <Gift size={32} color="#cbd5e1" />}
                      </div>
                      <div style={{ padding: 16 }}>
                        <h4 style={{ margin: 0, fontSize: '0.95rem', fontWeight: 800, color: '#071A45', marginBottom: 12 }}>{p.nome}</h4>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8' }}>ESTOQUE</span>
                          <span style={{ 
                            fontSize: '0.85rem', fontWeight: 900, 
                            color: disponiveis > 0 ? '#10b981' : '#ef4444' 
                          }}>
                            {disponiveis}/{p.quantidade}
                          </span>
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {activeTab === 'config' && (
            <div style={{ animation: 'fadeIn 0.3s ease', maxWidth: 800 }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 24 }}>Regras de Distribuição</h3>
              <form onSubmit={saveConfig}>
                <div style={{ marginBottom: 24 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Método de Seleção</label>
                  <select 
                    value={tipoRegra} 
                    onChange={(e) => setTipoRegra(e.target.value as any)}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }}
                  >
                    <option value="frequencia">Frequência Fixa (ex: a cada 50 pagamentos)</option>
                    <option value="especifico">Números Específicos (ex: 1º, 100º, 500º)</option>
                  </select>
                </div>

                {tipoRegra === 'frequencia' ? (
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Frequência Vencedora</label>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                      <span style={{ fontWeight: 700, color: '#475569' }}>A cada</span>
                      <input 
                        type="number" 
                        value={frequencia} 
                        onChange={e => setFrequencia(Number(e.target.value))} 
                        style={{ width: 100, padding: '12px', borderRadius: 12, border: '1px solid #e2e8f0', textAlign: 'center', fontSize: '1.1rem', fontWeight: 900 }}
                      />
                      <span style={{ fontWeight: 700, color: '#475569' }}>pagamentos confirmados</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ marginBottom: 24 }}>
                    <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Números dos Contemplados</label>
                    <input 
                      type="text" 
                      value={numerosEspecificos} 
                      onChange={e => setNumerosEspecificos(e.target.value)} 
                      placeholder="Ex: 50, 100, 153" 
                      style={{ width: '100%', padding: '12px 16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', fontWeight: 700, outline: 'none' }}
                    />
                    <p style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: 8 }}>Separe os números por vírgula.</p>
                  </div>
                )}

                <div style={{ marginBottom: 30 }}>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 800, color: '#94a3b8', marginBottom: 8, textTransform: 'uppercase' }}>Mensagem de Notificação (WhatsApp)</label>
                  <textarea 
                    value={instrucoes} 
                    onChange={e => setInstrucoes(e.target.value)} 
                    placeholder="Instruções para retirada do prêmio..." 
                    style={{ width: '100%', padding: '16px', borderRadius: 12, border: '1px solid #e2e8f0', fontSize: '1rem', outline: 'none', minHeight: 120, lineHeight: 1.5 }}
                  />
                </div>

                <button type="submit" style={{ background: '#071A45', color: '#fff', border: 'none', padding: '14px 40px', borderRadius: 12, fontWeight: 800, fontSize: '0.9rem', cursor: 'pointer' }}>
                  SALVAR CONFIGURAÇÃO
                </button>
              </form>
            </div>
          )}

          {activeTab === 'teste' && (
            <div style={{ animation: 'fadeIn 0.3s ease', maxWidth: 800 }}>
               <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 24 }}>Ferramentas de Simulação</h3>
               
               <div style={{ background: ganhoGarantido ? '#fef9c3' : '#f8fafc', padding: 24, borderRadius: 20, border: '1px solid #e2e8f0', marginBottom: 24 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h4 style={{ fontWeight: 800, color: '#071A45' }}>Ganho Garantido (DEBUG)</h4>
                    <FormSwitch checked={ganhoGarantido} onChange={setGanhoGarantido} label="" />
                  </div>
                  <p style={{ fontSize: '0.85rem', color: '#64748b', lineHeight: 1.5 }}>
                    Ao ativar esta opção, <strong>todas as inscrições reais</strong> que forem pagas serão contempladas imediatamente, ignorando as regras, até que o estoque acabe.
                  </p>
               </div>

               <div style={{ background: '#071A45', padding: 30, borderRadius: 24, color: '#fff' }}>
                  <h4 style={{ fontSize: '1.2rem', fontWeight: 900, color: '#6BFF2A', marginBottom: 12 }}>Simulador Visual de Ganhador</h4>
                  <p style={{ opacity: 0.8, fontSize: '0.9rem', marginBottom: 24, lineHeight: 1.5 }}>
                    Inicia a animação completa de sorteio e envia uma mensagem de teste para o seu WhatsApp. Excelente para demonstrar a experiência do ganhador.
                  </p>
                  <button onClick={handleSimulateWinner} style={{ background: '#6BFF2A', color: '#071A45', border: 'none', padding: '14px 28px', borderRadius: 12, fontWeight: 800, cursor: 'pointer' }}>
                    RODAR SIMULAÇÃO COMPLETA
                  </button>
               </div>
            </div>
          )}

          {activeTab === 'ganhadores' && (
            <div style={{ animation: 'fadeIn 0.3s ease' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 900, color: '#071A45', marginBottom: 24 }}>Histórico de Contemplados</h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 24 }}>
                {ganhadores.length === 0 ? (
                  <div style={{ gridColumn: '1/-1', padding: 80, textAlign: 'center', color: '#94a3b8', fontWeight: 600 }}>Nenhum ganhador registrado ainda.</div>
                ) : (
                  ganhadores.map((g: any) => (
                    <div key={g.id} style={{ background: '#fff', borderRadius: 24, border: '1px solid #e2e8f0', overflow: 'hidden', boxShadow: '0 4px 12px rgba(0,0,0,0.03)' }}>
                       {g.vitoriaImageUrl ? (
                        <div style={{ width: '100%', aspectRatio: '4/5', position: 'relative' }}>
                          <img src={g.vitoriaImageUrl} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: 20, background: 'linear-gradient(transparent, rgba(0,0,0,0.8))', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                            <div>
                               <div style={{ fontSize: '0.7rem', fontWeight: 800, opacity: 0.8 }}>{formatDateBR(g.dataHora)}</div>
                               <div style={{ fontSize: '1rem', fontWeight: 900 }}>{g.alunoNome}</div>
                            </div>
                            <a href={g.vitoriaImageUrl} target="_blank" style={{ width: 36, height: 36, borderRadius: 10, background: '#6BFF2A', color: '#071A45', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Download size={18} /></a>
                          </div>
                        </div>
                       ) : (
                        <div style={{ padding: 20 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 12 }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#94a3b8' }}>{formatDateBR(g.dataHora)}</span>
                            <span style={{ background: '#eff6ff', color: '#1e40af', padding: '4px 8px', borderRadius: 6, fontSize: '0.7rem', fontWeight: 800 }}>{g.premioNome}</span>
                          </div>
                          <div style={{ fontWeight: 800, fontSize: '1rem', color: '#071A45' }}>{g.alunoNome}</div>
                          <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: 4 }}>{g.telefone}</div>
                        </div>
                       )}
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>

      {editingPremio && (
        <div className="modal-overlay" onClick={() => setEditingPremio(null)}>
          <div className="modal-content" onClick={e => e.stopPropagation()} style={{ maxWidth: 500, padding: 30 }}>
            <h2 style={{ fontFamily: 'Montserrat', fontWeight: 800, color: '#071A45', marginBottom: 20 }}>
              {editingPremio.id === 'new' ? 'Adicionar Novo Prêmio' : 'Editar Prêmio'}
            </h2>
            <form onSubmit={e => { e.preventDefault(); handleSaveEditingPremio(); }}>
              <FormField>
                <FormLabel label="Nome do Prêmio" required />
                <FormInput 
                  value={editingPremio.nome} 
                  onChange={e => setEditingPremio({...editingPremio, nome: e.target.value})} 
                  placeholder="Ex: Camiseta Oficial"
                  required 
                />
              </FormField>
              
              <FormField>
                <FormLabel label="Foto do Prêmio" hint="Envie a foto real do produto" />
                <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                  <div style={{ 
                    width: 80, height: 80, borderRadius: 12, border: '1px solid #e2e8f0', 
                    background: editingPremio.imagem ? `url(${editingPremio.imagem}) center/cover` : '#f8f9fa',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    {!editingPremio.imagem && <Gift color="#ccc" size={32} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <label style={{ 
                      display: 'inline-flex', alignItems: 'center', gap: 8, 
                      padding: '10px 16px', background: uploadingImage ? '#f8f9fa' : '#fff', 
                      border: uploadingImage ? '2px solid #6BFF2A' : '2px dashed #ccc', 
                      borderRadius: 8, cursor: uploadingImage ? 'not-allowed' : 'pointer',
                      fontWeight: 600, color: uploadingImage ? '#071A45' : '#666', transition: 'all 0.2s', width: '100%', justifyContent: 'center',
                      position: 'relative', overflow: 'hidden'
                    }}>
                      {uploadingImage && (
                        <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: `${uploadProgress}%`, background: 'rgba(107,255,42,0.3)', transition: 'width 0.2s' }} />
                      )}
                      <UploadCloud size={20} style={{ position: 'relative', zIndex: 1 }} />
                      <span style={{ position: 'relative', zIndex: 1 }}>
                        {uploadingImage ? `Enviando... ${Math.round(uploadProgress)}%` : (editingPremio.imagem ? 'Trocar Imagem' : 'Fazer Upload')}
                      </span>
                      <input 
                        type="file" 
                        accept="image/*" 
                        onChange={handleImageUpload} 
                        style={{ display: 'none' }} 
                        disabled={uploadingImage}
                      />
                    </label>
                  </div>
                </div>
              </FormField>
              
              <FormGrid columns={2}>
                <FormField>
                  <FormLabel label="Quantidade Total" required hint="Total em estoque" />
                  <FormInput 
                    type="number" min="1" 
                    value={editingPremio.quantidade} 
                    onChange={e => setEditingPremio({...editingPremio, quantidade: Number(e.target.value)})} 
                    required 
                  />
                </FormField>
                <FormField>
                  <FormLabel label="Já Entregues" hint="Calculado automaticamente" />
                  <FormInput 
                    type="number" disabled 
                    value={editingPremio.distribuidos || 0} 
                    style={{ background: '#eee' }}
                  />
                </FormField>
              </FormGrid>

              <div style={{ 
                background: '#f8f9fa', 
                padding: '15px 20px', 
                borderRadius: 12, 
                marginBottom: 20, 
                border: editingPremio.ativo !== false ? '1px solid #6BFF2A' : '1px solid #eee'
              }}>
                <FormSwitch 
                  label="Prêmio Ativo para Sorteio"
                  checked={editingPremio.ativo !== false}
                  onChange={(val) => setEditingPremio({...editingPremio, ativo: val})}
                  hint="Se desativado, este prêmio não será sorteado nem em modo automático nem garantido."
                />
              </div>
              
              <FormActions>
                {editingPremio.id !== 'new' && (
                  <button type="button" className="btn btn-outline" style={{ color: '#e74c3c', borderColor: '#e74c3c', marginRight: 'auto' }} onClick={() => handleRemovePremio(editingPremio.id)}>
                    <Trash2 size={16} style={{ marginRight: 8 }} /> Excluir
                  </button>
                )}
                <button type="button" className="btn btn-outline" onClick={() => setEditingPremio(null)}>Cancelar</button>
                <button type="submit" className="btn btn-primary" disabled={uploadingImage}>Salvar Prêmio</button>
              </FormActions>
            </form>
          </div>
        </div>
      )}

      {/* Overlay de Simulação */}
      {simulating && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 9999 }}>
          {!simulatedPrize ? (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(7,26,69,0.95)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#fff' }}>
              <h2 style={{ fontSize: '2.5rem', marginBottom: 20, fontWeight: 800, color: '#6BFF2A', textAlign: 'center' }}>
                Sorteando Prêmio...
              </h2>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
                <div style={{ width: 80, height: 80, border: '6px solid rgba(107,255,42,0.2)', borderTopColor: '#6BFF2A', borderRadius: '50%', animation: 'spin 1s linear infinite' }} />
                <p style={{ opacity: 0.7 }}>Rodando roleta digital...</p>
                <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
              </div>
            </div>
          ) : (
            <WinnerExperience 
              atletaNome={simulatedAthlete.nome || "Carregando..."} 
              premioNome={simulatedPrize.nome} 
              premioImagem={simulatedPrize.imagem} 
              atletaFoto={simulatedAthlete.foto}
              isSimulacao={true}
              onClose={() => {
                setSimulating(false);
                setSimulatedPrize(null);
                setSimulatedAthlete(null);
              }}
            />
          )}
        </div>
      )}

      <LoadingModal isOpen={loading && !simulating} />
    </div>
  );
}

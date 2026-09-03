import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import QRCode from 'qrcode';
import SignatureCanvas from 'react-signature-canvas';
import Cropper, { type Area } from 'react-easy-crop';
import { addDoc, collection, doc, getCountFromServer, getDoc, getDocs, query, runTransaction, serverTimestamp, where } from 'firebase/firestore';
import { ArrowRight, Baby, Camera, CreditCard, Mail, Phone, PersonStanding, User, Users } from 'lucide-react';
import { db } from '../firebase';
import { CATEGORIAS, KITS, TAMANHOS_CAMISETA } from '../types';
import LoadingModal from '../components/LoadingModal';
import { useDialog } from '../context/CustomDialogContext';
import { REGULAMENTO_OFICIAL } from '../content/regulamentoOficial';
import '../App.css';

const INITIAL = {
  nome: '',
  cpf: '',
  dataNascimento: '',
  responsavelNome: '',
  responsavelCpf: '',
  sexo: '',
  email: '',
  telefone: '',
  telefoneSecundario: '',
  endereco: { cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: '', semCep: false },
  integranteEquipe: 'nao',
  equipeNome: '',
  servidorPublicoMunicipal: false,
  matriculaServidor: '',
  pcd: false,
  categoria: '',
  kit: 'unico',
  tamanhoCamiseta: '',
  saude: {
    temAlergia: false,
    alergiaDesc: '',
    tomaMedicamento: false,
    medicamentoDesc: '',
    condicaoSaude: '',
    autorizadoAtividades: true,
  },
  fotoUrl: '',
  contatoEmergencia: { nome: '', telefone: '', parentesco: '' },
  assinatura: '',
};

const PIX_PAYMENT_FEE_CENTS_BY_PROVIDER = {
  asaas: 200,
  cora: 50,
} as const;

type PaymentProvider = keyof typeof PIX_PAYMENT_FEE_CENTS_BY_PROVIDER;

type LoteDiscount = {
  enabled: boolean;
  type: 'fixed' | 'percent';
  value: number;
};

type RegistrationPricing = {
  price: number;
  loteDiscount: LoteDiscount;
  loteIndex: number | null;
};

type CouponDiscountType = 'fixed' | 'percent';

type AppliedCoupon = {
  id: string;
  code: string;
  type: CouponDiscountType;
  value: number;
  discountAmount: number;
  amountAfterDiscount: number;
};

const EMPTY_LOTE_DISCOUNT: LoteDiscount = { enabled: false, type: 'percent', value: 0 };

const normalizeLoteDiscount = (discount?: Partial<LoteDiscount> | null): LoteDiscount => ({
  enabled: Boolean(discount?.enabled),
  type: discount?.type === 'fixed' ? 'fixed' : 'percent',
  value: Number(discount?.value || 0),
});

const normalizeCouponCode = (value: string) => value.trim().toUpperCase().replace(/\s+/g, '');

const calculateCouponDiscount = (amountInCents: number, type: CouponDiscountType, rawValue: number) => {
  const value = Number(rawValue || 0);
  if (amountInCents <= 0 || value <= 0) return { discountAmount: 0, amountAfterDiscount: amountInCents };
  const discountAmount = type === 'fixed'
    ? Math.min(Math.round(value), amountInCents)
    : Math.min(Math.round(amountInCents * (Math.min(value, 100) / 100)), amountInCents);
  return {
    discountAmount,
    amountAfterDiscount: Math.max(amountInCents - discountAmount, 0),
  };
};

const normalizeWhatsAppPhone = (phone: string) => {
  const cleanPhone = (phone || '').replace(/\D/g, '');
  return cleanPhone.startsWith('55') ? cleanPhone : `55${cleanPhone}`;
};

const validateCPF = (cpf: string) => {
  const clean = cpf.replace(/\D/g, '');
  if (clean.length !== 11 || /^(\d)\1+$/.test(clean)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += Number(clean[i]) * (10 - i);
  let digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  if (digit !== Number(clean[9])) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += Number(clean[i]) * (11 - i);
  digit = 11 - (sum % 11);
  if (digit >= 10) digit = 0;
  return digit === Number(clean[10]);
};

const calculateAgeFromBirthdate = (dobStr: string) => {
  if (!dobStr || dobStr.length < 10) return 0;
  const [day, month, year] = dobStr.split('/').map(Number);
  const birth = new Date(year, month - 1, day);
  if (Number.isNaN(birth.getTime())) return 0;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const monthDiff = today.getMonth() - birth.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) age--;
  return age;
};

const applyLoteDiscount = (amountInCents: number, rawDiscount?: Partial<LoteDiscount> | null) => {
  const discount = normalizeLoteDiscount(rawDiscount);
  if (!discount.enabled || !discount.value || discount.value <= 0) {
    return { amount: amountInCents, discountAmount: 0, discountLabel: '' };
  }

  const discountAmount = discount.type === 'fixed'
    ? Math.min(Math.round(discount.value), amountInCents)
    : Math.min(Math.round(amountInCents * (Number(discount.value) / 100)), amountInCents);

  return {
    amount: Math.max(amountInCents - discountAmount, 0),
    discountAmount,
    discountLabel: discount.type === 'fixed'
      ? `Desconto do lote: ${formatMoney(discountAmount)}`
      : `Desconto do lote: ${Number(discount.value)}%`,
  };
};

const applyRegistrationDiscount = (pricing: RegistrationPricing, age: number, isMunicipalServer: boolean, isPcd: boolean) => {
  const isSenior = age >= 60;
  const hasHalfPrice = isSenior || isPcd;
  const isServer = isMunicipalServer && !hasHalfPrice;
  const loteDiscount = applyLoteDiscount(pricing.price, pricing.loteDiscount);
  const halfPriceAmount = hasHalfPrice ? Math.round(loteDiscount.amount / 2) : 0;
  const serverAmount = isServer ? Math.round(loteDiscount.amount * 0.2) : 0;
  const labels = [
    loteDiscount.discountLabel,
    isSenior ? 'Idoso 60+ (50%)' : '',
    isPcd && !isSenior ? 'PCD (50%)' : '',
    isServer ? 'Servidor publico municipal' : '',
  ].filter(Boolean);

  return {
    amount: Math.max(loteDiscount.amount - halfPriceAmount - serverAmount, 0),
    originalAmount: pricing.price,
    isSenior,
    isPcd,
    isMunicipalServer: isServer,
    discountLabel: labels.join(' + '),
    loteDiscount,
    loteIndex: pricing.loteIndex ?? null,
  };
};

const formatMoney = (valueInCents: number) => {
  return (valueInCents / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

const formatRegistrationNotice = ({
  registration,
  amount,
  paymentPageUrl,
  categoriaNome,
  modalidadeNome,
  camisetaLabel,
  invoiceUrl,
}: {
  registration: any;
  amount: number;
  paymentPageUrl: string;
  categoriaNome: string;
  modalidadeNome: string;
  camisetaLabel: string;
  invoiceUrl: string;
}) => {
  const endereco = registration.endereco || {};
  const contato = registration.contatoEmergencia || {};
  const saude = registration.saude || {};

  return `Novo atleta preencheu o formulario:\n\n` +
    `*Nome:* ${registration.nome || '-'}\n` +
    `*CPF:* ${registration.cpf || '-'}\n` +
    `*Nascimento:* ${registration.dataNascimento || '-'}\n` +
    `*Responsavel:* ${registration.responsavelNome || '-'}\n` +
    `*CPF Responsavel:* ${registration.responsavelCpf || '-'}\n` +
    `*Sexo:* ${registration.sexo || '-'}\n` +
    `*E-mail:* ${registration.email || '-'}\n` +
    `*WhatsApp:* ${registration.telefone || '-'}\n` +
    `*PCD:* ${registration.pcd ? 'Sim' : 'Nao'}\n` +
    `*Servidor publico municipal:* ${registration.servidorPublicoMunicipal ? 'Sim' : 'Nao'}\n` +
    `*Matricula servidor:* ${registration.matriculaServidor || '-'}\n` +
    `*Equipe:* ${registration.integranteEquipe === 'sim' ? (registration.equipeNome || 'Sim') : 'Nao'}\n\n` +
    `*Categoria:* ${categoriaNome || registration.categoria || '-'}\n` +
    `*Prova:* ${modalidadeNome || '-'}\n` +
    `*Kit:* ${registration.kit || '-'}\n` +
    `*Camiseta:* ${camisetaLabel || registration.tamanhoCamiseta || '-'}\n` +
    `*Valor:* ${formatMoney(amount)}\n\n` +
    `*Endereco:* ${endereco.rua || '-'}, ${endereco.numero || '-'} - ${endereco.bairro || '-'}, ${endereco.cidade || '-'}-${endereco.uf || '-'}\n` +
    `*CEP:* ${endereco.cep || '-'}\n\n` +
    `*Contato de emergencia:* ${contato.nome || '-'}\n` +
    `*Telefone emergencia:* ${contato.telefone || '-'}\n` +
    `*Parentesco:* ${contato.parentesco || '-'}\n\n` +
    `*Saude:* ${saude.condicaoSaude || '-'}\n` +
    `*Alergia:* ${saude.temAlergia ? (saude.alergiaDesc || 'Sim') : 'Nao'}\n` +
    `*Medicamento:* ${saude.tomaMedicamento ? (saude.medicamentoDesc || 'Sim') : 'Nao'}\n\n` +
    `*Pagamento:* ${paymentPageUrl}\n` +
    (invoiceUrl ? `*Link direto do banco:* ${invoiceUrl}` : '');
};

export default function PublicForm() {
  const navigate = useNavigate();
  const { showAlert } = useDialog();
  const sigCanvas = useRef<SignatureCanvas | null>(null);

  const [data, setData] = useState<any>({ ...INITIAL });
  const [registrationsClosed, setRegistrationsClosed] = useState(false);
  const [bypassClosedScreen, setBypassClosedScreen] = useState(() => sessionStorage.getItem('nightrun:bypass-closed-screen') === 'true');
  const [stage, setStage] = useState<'form' | 'review'>('form');
  const [showSignatureModal, setShowSignatureModal] = useState(false);
  const [acceptedRegulation, setAcceptedRegulation] = useState(false);
  const [modalidades, setModalidades] = useState<any[]>([]);
  const [camisetas, setCamisetas] = useState<any[]>([]);
  const [activeKit, setActiveKit] = useState<{ id: string; nome: string; precoForcado: boolean; precoForcadoValor: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingMessage, setLoadingMessage] = useState('Processando sua inscrição...');
  const [pricePreview, setPricePreview] = useState<number | null>(null);
  const [couponCode, setCouponCode] = useState('');
  const [appliedCoupon, setAppliedCoupon] = useState<AppliedCoupon | null>(null);
  const [couponLoading, setCouponLoading] = useState(false);
  const [couponFeedback, setCouponFeedback] = useState('');
  const [showSizeTable, setShowSizeTable] = useState(false);
  const [photoCrop, setPhotoCrop] = useState<{ src: string; name: string; type: string } | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [cropZoom, setCropZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null);

  const set = (field: string, value: any) => setData((prev: any) => ({ ...prev, [field]: value }));
  const setEndereco = (field: string, value: any) => setData((prev: any) => ({ ...prev, endereco: { ...prev.endereco, [field]: value } }));
  const setContato = (field: string, value: any) => setData((prev: any) => ({ ...prev, contatoEmergencia: { ...prev.contatoEmergencia, [field]: value } }));
  const setSaude = (field: string, value: any) => setData((prev: any) => ({ ...prev, saude: { ...prev.saude, [field]: value } }));

  const userAge = calculateAgeFromBirthdate(data.dataNascimento);
  const hasCompleteBirthDate = data.dataNascimento.length === 10;
  const isChildRegistration = data.categoria === 'infantil';
  const requiresResponsible = isChildRegistration;
  const hasSeniorDiscount = data.categoria === 'adulto' && userAge >= 60;
  const hasPcdDiscount = data.categoria === 'adulto' && data.pcd;
  const hasMunicipalServerDiscount = data.categoria === 'adulto' && data.servidorPublicoMunicipal;
  const discountPreviewText = hasSeniorDiscount
    ? 'Idoso 60+: 50% de desconto.'
      : hasPcdDiscount
        ? 'PCD: 50% de desconto.'
      : hasMunicipalServerDiscount
        ? 'Servidor municipal: 20% de desconto.'
      : '';
  const birthYear = hasCompleteBirthDate ? Number(data.dataNascimento.split('/')[2]) : null;
  const birthDateMatchesCategory = !hasCompleteBirthDate ||
    (isChildRegistration ? userAge <= 12 : data.categoria === 'adulto' ? userAge > 12 : true);

  const adultModalities = modalidades.filter(mod => (mod.categoria || 'adulto') === 'adulto');
  const matchingChildModalities = modalidades.filter(mod =>
    mod.categoria === 'infantil' &&
    (
      (typeof mod.idadeMin === 'number' && typeof mod.idadeMax === 'number' && userAge >= mod.idadeMin && userAge <= mod.idadeMax) ||
      (birthYear !== null && (mod.anosNascimento || []).includes(birthYear))
    )
  );
  const allCamisetas = camisetas.length ? camisetas : TAMANHOS_CAMISETA.map(t => ({ ...t, estoque: 999, ativo: true, categoria: t.categoria || 'todos' }));
  const availableCamisetas = allCamisetas.filter(t => {
    if (t.ativo === false) return false;
    const target = t.categoria || 'todos';
    if (isChildRegistration) return target === 'todos' || target === 'infantil';
    return target === 'todos' || target === 'adulto';
  }).sort((a, b) => (a.ordem ?? 9999) - (b.ordem ?? 9999));
  const selectedCategoria = CATEGORIAS.find(c => c.id === data.categoria)?.nome || '-';
  const selectedModalidade = modalidades.find(m => m.id === data.modalidadeId);
  const selectedModalidadeNome = selectedModalidade?.nome || '';
  const autoLockedChildModalityId = isChildRegistration && hasCompleteBirthDate && matchingChildModalities.length === 1
    ? matchingChildModalities[0].id
    : '';
  const selectedCamiseta = availableCamisetas.find(t => t.id === data.tamanhoCamiseta);
  const selectedCamisetaMedida = selectedCamiseta?.medidas ? `${selectedCamiseta?.medidas.largura} x ${selectedCamiseta?.medidas.altura} cm` : '';
  const selectedCamisetaSummary = selectedCamiseta ? `${selectedCamiseta.label}${selectedCamisetaMedida ? ` - ${selectedCamisetaMedida}` : ''}` : '-';
  const sizeTableImage = isChildRegistration ? '/tabela-tamanho-infantil.jpeg' : '/tabela-tamanho.jpeg';

  const personalValid =
    !!data.categoria &&
    data.nome.trim().split(/\s+/).length >= 2 &&
    validateCPF(data.cpf) &&
    hasCompleteBirthDate &&
    birthDateMatchesCategory &&
    (!requiresResponsible || (data.responsavelNome.trim().length >= 3 && validateCPF(data.responsavelCpf))) &&
    !!data.sexo &&
    data.email.includes('@') &&
    data.telefone.length >= 14 &&
    (!data.servidorPublicoMunicipal || data.matriculaServidor.trim().length >= 2) &&
    (data.integranteEquipe !== 'sim' || data.equipeNome.trim().length >= 2);
  const emergencyValid = data.contatoEmergencia.nome.length > 3 && data.contatoEmergencia.telefone.length >= 14;
  const modalityValid = !!data.modalidadeId && !!selectedModalidade;
  const shirtValid = !!data.tamanhoCamiseta;
  const photoValid = !!data.fotoUrl;
  const healthValid = !!data.saude.condicaoSaude;
  const firstStageValid = personalValid && emergencyValid && modalityValid && shirtValid && photoValid && healthValid;
  const signatureValid = !!data.assinatura && acceptedRegulation;
  const stageValid = stage === 'form' ? firstStageValid : true;
  const nextLabel = stage === 'form' ? 'REVISAR INSCRIÇÃO' : 'CONFIRMAR INSCRIÇÃO';

  const maskCPF = (value: string) => value.replace(/\D/g, '').slice(0, 11).replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d)/, '$1.$2').replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  const maskPhone = (value: string) => value.replace(/\D/g, '').slice(0, 11).replace(/(\d{2})(\d)/, '($1) $2').replace(/(\d{5})(\d)/, '$1-$2');
  const maskCEP = (value: string) => value.replace(/\D/g, '').slice(0, 8).replace(/(\d{5})(\d)/, '$1-$2');
  const maskDate = (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, 8);
    if (clean.length <= 2) return clean;
    if (clean.length <= 4) return `${clean.slice(0, 2)}/${clean.slice(2)}`;
    return `${clean.slice(0, 2)}/${clean.slice(2, 4)}/${clean.slice(4)}`;
  };

  useEffect(() => {
    const loadData = async () => {
      try {
        const [modalidadesSnap, camisetasSnap, kitsSnap] = await Promise.all([
          getDocs(query(collection(db, 'nightrun_modalidades'), where('ativo', '==', true))),
          getDocs(collection(db, 'nightrun_camisetas')),
          getDocs(query(collection(db, 'nightrun_kits'), where('ativo', '==', true))),
        ]);
        setModalidades(modalidadesSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        setCamisetas(camisetasSnap.docs.map(d => ({ id: d.id, ...d.data() })));
        const kitDoc = kitsSnap.docs[0];
        if (kitDoc) {
          const kitData = kitDoc.data();
          setActiveKit({
            id: kitDoc.id,
            nome: kitData.nome || 'Kit',
            precoForcado: !!kitData.precoForcado,
            precoForcadoValor: Number(kitData.precoForcadoValor || 0),
          });
        }
      } catch (error) {
        console.error('Erro ao carregar dados do formulario:', error);
      }
    };
    loadData();
  }, []);

  useEffect(() => {
    const checkMaintenance = async () => {
      try {
        const snap = await getDoc(doc(db, 'nightrun_settings', 'site_maintenance'));
        if (snap.exists()) {
          setRegistrationsClosed(snap.data().registrationsClosed !== false);
        }
      } catch (e) {
        console.error('Erro ao carregar status de manutencao', e);
      }
    };
    checkMaintenance();
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Atalho Ctrl + Shift + '
      if (e.ctrlKey && e.shiftKey && (e.key === "'" || e.key === '"' || e.code === 'Quote')) {
        e.preventDefault();

        // Encontrar uma modalidade de adulto ativa no Firestore
        const adultMod = modalidades.find(m => (m.categoria || 'adulto') === 'adulto');
        const modId = adultMod ? adultMod.id : '';

        // Encontrar uma camiseta disponível
        const firstShirt = camisetas.find(t => (t.estoque || 0) > 0) || TAMANHOS_CAMISETA[0];
        const shirtId = firstShirt ? firstShirt.id : 'M';

        const mockData = {
          categoria: 'adulto',
          nome: 'autocompletar da silva',
          cpf: '151.333.006-38',
          dataNascimento: '20/05/2002',
          responsavelNome: '',
          responsavelCpf: '',
          sexo: 'F',
          email: 'autocompletar@teste.com',
          telefone: '(33) 99820-0546',
          telefoneSecundario: '',
          endereco: { cep: '', rua: '', numero: '', bairro: '', cidade: '', uf: '', semCep: false },
          integranteEquipe: 'nao',
          equipeNome: '',
          servidorPublicoMunicipal: false,
          matriculaServidor: '',
          pcd: false,
          modalidadeId: modId,
          kit: 'unico',
          tamanhoCamiseta: shirtId,
          saude: {
            temAlergia: false,
            alergiaDesc: '',
            tomaMedicamento: false,
            medicamentoDesc: '',
            condicaoSaude: 'excelente',
            autorizadoAtividades: true,
          },
          fotoUrl: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2auto=format&fit=crop&q=80&w=200',
          contatoEmergencia: { nome: 'rita', telefone: '(33) 98412-1017', parentesco: 'Mãe' },
          assinatura: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
        };

        setData(mockData);
        setStage('review');
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [modalidades, camisetas]);


  useEffect(() => {
    if (isChildRegistration && hasCompleteBirthDate && matchingChildModalities.length === 1) {
      const onlyModalityId = matchingChildModalities[0].id;
      if (data.modalidadeId !== onlyModalityId) {
        set('modalidadeId', onlyModalityId);
      }
      return;
    }
    if (!data.modalidadeId) return;
    const validModalities = isChildRegistration ? matchingChildModalities : adultModalities;
    if (!validModalities.some(mod => mod.id === data.modalidadeId)) {
      set('modalidadeId', '');
    }
  }, [birthYear, data.modalidadeId, hasCompleteBirthDate, isChildRegistration, modalidades]);

  useEffect(() => {
    if (stage !== 'review') return;
    const fetchPricePreview = async () => {
      try {
        const pricing = await calculateBaseAmount();
        const discount = applyRegistrationDiscount(pricing, userAge, data.categoria === 'adulto' && data.servidorPublicoMunicipal, data.categoria === 'adulto' && data.pcd);
        const couponDiscount = appliedCoupon
          ? calculateCouponDiscount(discount.amount, appliedCoupon.type, appliedCoupon.value)
          : { amountAfterDiscount: discount.amount };
        setPricePreview(couponDiscount.amountAfterDiscount);
      } catch (error) {
        console.error('Erro ao prever preço:', error);
      }
    };
    fetchPricePreview();
  }, [stage, data.categoria, data.dataNascimento, data.servidorPublicoMunicipal, data.pcd, appliedCoupon]);

  useEffect(() => {
    setAppliedCoupon(null);
    setCouponFeedback('');
  }, [data.categoria, data.dataNascimento, data.servidorPublicoMunicipal, data.pcd, data.modalidadeId]);

  const selectCategory = (categoria: 'infantil' | 'adulto') => {
    setData((prev: any) => ({
      ...prev,
      categoria,
      modalidadeId: '',
      servidorPublicoMunicipal: categoria === 'adulto' ? prev.servidorPublicoMunicipal : false,
      pcd: categoria === 'adulto' ? prev.pcd : false,
      matriculaServidor: categoria === 'adulto' ? prev.matriculaServidor : '',
    }));
  };

  const handleCep = async (value: string) => {
    const cep = value.replace(/\D/g, '');
    setEndereco('cep', maskCEP(cep));
    if (cep.length !== 8) return;
    try {
      const res = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const address = await res.json();
      if (!address.erro) {
        setData((prev: any) => ({
          ...prev,
          endereco: {
            ...prev.endereco,
            cep: maskCEP(cep),
            rua: address.logradouro || prev.endereco.rua,
            bairro: address.bairro || prev.endereco.bairro,
            cidade: address.localidade || prev.endereco.cidade,
            uf: address.uf || prev.endereco.uf,
          },
        }));
      }
    } catch (error) {
      console.error('Erro ao buscar CEP:', error);
    }
  };

  const loadImage = (src: string) => new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });

  const uploadMediaFile = async (file: File, folder: string) => {
    const workerUrl = import.meta.env.VITE_WORKER_URL;
    const form = new FormData();
    form.append('file', file);
    form.append('folder', folder);
    const res = await fetch(`${workerUrl}/media/upload`, { method: 'POST', body: form });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body.url) throw new Error(body.error || 'Falha ao enviar arquivo.');
    return body.url as string;
  };

  const drawCover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.max(width / img.naturalWidth, height / img.naturalHeight);
    const sw = width / scale;
    const sh = height / scale;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;
    ctx.drawImage(img, sx, sy, sw, sh, x, y, width, height);
  };

  const drawContain = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, width: number, height: number) => {
    const scale = Math.min(width / img.naturalWidth, height / img.naturalHeight);
    const drawWidth = img.naturalWidth * scale;
    const drawHeight = img.naturalHeight * scale;
    const dx = x + (width - drawWidth) / 2;
    const dy = y + (height - drawHeight) / 2;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, width, height);
    ctx.drawImage(img, dx, dy, drawWidth, drawHeight);
  };

  const drawFitText = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, initialSize: number, minSize: number, color: string) => {
    const normalizedText = text.trim().toUpperCase();
    let size = initialSize;
    ctx.font = `900 ${size}px Arial Black, Impact, sans-serif`;
    while (ctx.measureText(normalizedText).width > maxWidth && size > minSize) {
      size -= 2;
      ctx.font = `900 ${size}px Arial Black, Impact, sans-serif`;
    }
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.68)';
    ctx.lineWidth = Math.max(3, size * 0.055);
    ctx.strokeText(normalizedText, x, y);
    ctx.fillText(normalizedText, x, y);
  };

  const generateEuVouCard = async (photoUrl: string, modalidadeNome: string, isKidsCard = false) => {
    const templatePath = isKidsCard ? '/modelo-card-kids.png' : '/modelo-card.png';
    const [template, photo] = await Promise.all([loadImage(templatePath), loadImage(photoUrl)]);
    const canvas = document.createElement('canvas');
    canvas.width = template.naturalWidth;
    canvas.height = template.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Navegador sem suporte para montar o card.');
    ctx.drawImage(template, 0, 0, canvas.width, canvas.height);
    const box = {
      centerX: canvas.width * 0.6738,
      centerY: canvas.height * 0.4429,
      width: canvas.width * 0.4955,
      height: canvas.height * 0.4265,
      rotation: 4.35 * Math.PI / 180,
    };
    ctx.save();
    ctx.translate(box.centerX, box.centerY);
    ctx.rotate(box.rotation);
    
    // Salva o estado antes do clip para a foto
    ctx.save();
    ctx.beginPath();
    ctx.rect(-box.width / 2, -box.height / 2, box.width, box.height);
    ctx.clip();
    if (isKidsCard) {
      drawContain(ctx, photo, -box.width / 2, -box.height / 2, box.width, box.height);
    } else {
      drawCover(ctx, photo, -box.width / 2, -box.height / 2, box.width, box.height);
    }
    ctx.restore();

    // Desenha uma borda branca sem border-radius para evitar vazamentos e cobrir frestas
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 8;
    ctx.strokeRect(-box.width / 2, -box.height / 2, box.width, box.height);

    ctx.restore();

    ctx.save();
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const modalityX = canvas.width * (isKidsCard ? 0.108 : 0.095);
    const modalityY = canvas.height * 0.412;
    ctx.font = `900 ${canvas.width * 0.018}px Arial Black, Impact, sans-serif`;
    ctx.fillStyle = '#6BFF2A';
    ctx.fillText('MODALIDADE', modalityX, modalityY + canvas.height * 0.008);
    drawFitText(ctx, modalidadeNome || 'MCU NIGHT RUN', modalityX + canvas.width * 0.012, modalityY + canvas.height * 0.029, canvas.width * 0.205, canvas.width * 0.034, canvas.width * 0.022, '#ffffff');
    ctx.restore();

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error('Falha ao gerar card.')), 'image/jpeg', 0.9);
    });
    return uploadMediaFile(new File([blob], `eu-vou-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'nightrun_cards');
  };

  const handlePhoto = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPhotoCrop({ src: String(reader.result), name: file.name, type: file.type || 'image/jpeg' });
      setCrop({ x: 0, y: 0 });
      setCropZoom(1);
      setCroppedAreaPixels(null);
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const confirmPhotoCrop = async () => {
    if (!photoCrop || !croppedAreaPixels) return;
    setLoadingMessage('Processando e enviando sua foto...');
    setLoading(true);
    try {
      const img = await loadImage(photoCrop.src);
      const canvas = document.createElement('canvas');
      canvas.width = 900;
      canvas.height = 900;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Navegador sem suporte a corte.');
      ctx.drawImage(img, croppedAreaPixels.x, croppedAreaPixels.y, croppedAreaPixels.width, croppedAreaPixels.height, 0, 0, 900, 900);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(result => result ? resolve(result) : reject(new Error('Falha ao cortar foto.')), 'image/jpeg', 0.92);
      });
      const url = await uploadMediaFile(new File([blob], `foto-${Date.now()}.jpg`, { type: 'image/jpeg' }), 'nightrun_photos');
      set('fotoUrl', url);
      setPhotoCrop(null);
    } catch (error: any) {
      showAlert(error.message || 'Erro ao processar foto.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const onCropComplete = useCallback((_area: Area, pixels: Area) => setCroppedAreaPixels(pixels), []);

  const calculateBaseAmount = async (): Promise<RegistrationPricing> => {
    // Kit ativo com preço forçado ignora o lote por completo - o valor abaixo vira a base
    // do cálculo, e os descontos de idoso/PCD/servidor/cupom continuam se aplicando por cima
    // normalmente, exatamente como aconteceria com o preço do lote.
    if (activeKit?.precoForcado && activeKit.precoForcadoValor > 0) {
      return { price: activeKit.precoForcadoValor, loteDiscount: EMPTY_LOTE_DISCOUNT, loteIndex: null };
    }
    const settingsSnap = await getDoc(doc(db, 'nightrun_settings', 'lotes'));
    const settings = settingsSnap.exists() ? settingsSnap.data() : {
      adulto: [{ max: 500, price: 11000 }, { max: 750, price: 12500 }, { max: 1000, price: 15000 }],
      infantil: { price: 8000 },
    };
    const adultLots = Array.isArray(settings.adulto) && settings.adulto.length > 0 ? settings.adulto : [{ max: 1000, price: 11000, discount: EMPTY_LOTE_DISCOUNT }];
    const infantil = settings.infantil || { price: 8000, discount: EMPTY_LOTE_DISCOUNT };
    if (!settings.infantil) settings.infantil = infantil;

    if (data.categoria === 'infantil') {
      return { price: Number(infantil.price || 8000), loteDiscount: settings.infantil.discount || EMPTY_LOTE_DISCOUNT, loteIndex: null };
    }

    if (settings.mode === 'manual') {
      const manualIndex = Math.min(Math.max(Number(settings.manualIndex || 0), 0), adultLots.length - 1);
      const lote = adultLots[manualIndex] || adultLots[0];
      return { price: Number(lote.price || 0), loteDiscount: lote.discount || EMPTY_LOTE_DISCOUNT, loteIndex: manualIndex };
    }

    const countSnap = await getCountFromServer(collection(db, 'nightrun_registrations'));
    const count = countSnap.data().count;
    const loteIndex = adultLots.findIndex((lot: any) => count < lot.max);
    const currentIndex = loteIndex >= 0 ? loteIndex : adultLots.length - 1;
    const lote = adultLots[currentIndex] || adultLots[0];
    return { price: Number(lote.price || 0), loteDiscount: lote.discount || EMPTY_LOTE_DISCOUNT, loteIndex: currentIndex };
  };

  const validateCouponForAmount = async (rawCode: string, amountInCents: number): Promise<AppliedCoupon> => {
    const normalizedCode = normalizeCouponCode(rawCode);
    if (!normalizedCode) throw new Error('Informe o codigo do cupom.');
    const couponRef = doc(db, 'nightrun_discount_coupons', normalizedCode);
    const couponSnap = await getDoc(couponRef);
    if (!couponSnap.exists()) throw new Error('Cupom nao encontrado.');
    const coupon = couponSnap.data();
    const type: CouponDiscountType = coupon.type === 'fixed' ? 'fixed' : 'percent';
    const maxUses = Number(coupon.maxUses || 0);
    const usedCount = Number(coupon.usedCount || 0);
    if (coupon.active === false) throw new Error('Este cupom esta inativo.');
    if (maxUses <= 0 || usedCount >= maxUses) throw new Error('Este cupom nao possui usos disponiveis.');
    const discount = calculateCouponDiscount(amountInCents, type, Number(coupon.value || 0));
    if (discount.discountAmount <= 0) throw new Error('Este cupom nao gera desconto para esta inscricao.');
    return {
      id: couponSnap.id,
      code: String(coupon.code || normalizedCode).toUpperCase(),
      type,
      value: Number(coupon.value || 0),
      discountAmount: discount.discountAmount,
      amountAfterDiscount: discount.amountAfterDiscount,
    };
  };

  const handleApplyCoupon = async () => {
    setCouponLoading(true);
    setCouponFeedback('');
    try {
      const pricing = await calculateBaseAmount();
      const discount = applyRegistrationDiscount(pricing, userAge, data.categoria === 'adulto' && data.servidorPublicoMunicipal, data.categoria === 'adulto' && data.pcd);
      const coupon = await validateCouponForAmount(couponCode, discount.amount);
      setAppliedCoupon(coupon);
      setCouponCode(coupon.code);
      setPricePreview(coupon.amountAfterDiscount);
      setCouponFeedback(`Cupom aplicado: -${formatMoney(coupon.discountAmount)}.`);
      showAlert('Cupom aplicado com sucesso.', 'success');
    } catch (error: any) {
      setAppliedCoupon(null);
      setCouponFeedback(error.message || 'Nao foi possivel aplicar o cupom.');
      showAlert(error.message || 'Nao foi possivel aplicar o cupom.', 'warning');
    } finally {
      setCouponLoading(false);
    }
  };

  const consumeCouponForAmount = async (rawCode: string, amountInCents: number): Promise<AppliedCoupon | null> => {
    const normalizedCode = normalizeCouponCode(rawCode);
    if (!normalizedCode) return null;
    const couponRef = doc(db, 'nightrun_discount_coupons', normalizedCode);
    return runTransaction(db, async transaction => {
      const couponSnap = await transaction.get(couponRef);
      if (!couponSnap.exists()) throw new Error('Cupom nao encontrado.');
      const coupon = couponSnap.data();
      const type: CouponDiscountType = coupon.type === 'fixed' ? 'fixed' : 'percent';
      const maxUses = Number(coupon.maxUses || 0);
      const usedCount = Number(coupon.usedCount || 0);
      if (coupon.active === false) throw new Error('Este cupom esta inativo.');
      if (maxUses <= 0 || usedCount >= maxUses) throw new Error('Este cupom nao possui usos disponiveis.');
      const discount = calculateCouponDiscount(amountInCents, type, Number(coupon.value || 0));
      if (discount.discountAmount <= 0) throw new Error('Este cupom nao gera desconto para esta inscricao.');
      transaction.update(couponRef, {
        usedCount: usedCount + 1,
        updatedAt: serverTimestamp(),
        lastUsedAt: serverTimestamp(),
      });
      return {
        id: couponSnap.id,
        code: String(coupon.code || normalizedCode).toUpperCase(),
        type,
        value: Number(coupon.value || 0),
        discountAmount: discount.discountAmount,
        amountAfterDiscount: discount.amountAfterDiscount,
      };
    });
  };

  const handleSubmit = async () => {
    console.log('[PublicForm] submit:start', { nome: data.nome, telefone: data.telefone, categoria: data.categoria, modalidadeId: data.modalidadeId, hasPhoto: Boolean(data.fotoUrl) });
    if (!firstStageValid) return showAlert('Revise os dados obrigatórios antes de continuar.', 'warning');
    if (!signatureValid) return showAlert('Leia e aceite o regulamento e assine para continuar.', 'warning');
    if (couponCode.trim() && normalizeCouponCode(couponCode) !== appliedCoupon?.code) {
      return showAlert('Clique em Aplicar para validar o cupom antes de confirmar a inscricao.', 'warning');
    }
    setLoadingMessage('Processando sua inscrição...');
    setLoading(true);
    try {
      const workerUrl = import.meta.env.VITE_WORKER_URL;
      const paymentIntegrationSnap = await getDoc(doc(db, 'nightrun_settings', 'payment_integration'));
      const selectedProvider = paymentIntegrationSnap.exists() ? paymentIntegrationSnap.data().provider : 'asaas';
      const paymentProvider: PaymentProvider = selectedProvider === 'cora' ? 'cora' : 'asaas';
      const baseAmount = await calculateBaseAmount();
      const registrationDiscount = applyRegistrationDiscount(baseAmount, userAge, data.categoria === 'adulto' && data.servidorPublicoMunicipal, data.categoria === 'adulto' && data.pcd);
      const couponDiscount = appliedCoupon ? await consumeCouponForAmount(appliedCoupon.code, registrationDiscount.amount) : null;
      const registrationAmount = couponDiscount?.amountAfterDiscount ?? registrationDiscount.amount;
      // Inscrição gratuita: cupom (ou combinação de descontos) zerou o valor da inscrição.
      // Nesse caso não geramos cobrança em nenhum provedor (Cora/Asaas) e não cobramos taxa de PIX.
      const isFreeRegistration = registrationAmount <= 0;
      const paymentFee = isFreeRegistration ? 0 : PIX_PAYMENT_FEE_CENTS_BY_PROVIDER[paymentProvider];
      const amount = registrationAmount + paymentFee;
      console.log('[PublicForm] submit:amount', { amount, registrationAmount, paymentFee, isFreeRegistration, originalAmount: registrationDiscount.originalAmount, registrationDiscount, couponDiscount });

      let paymentCustomerId = '';
      let paymentExternalId = '';
      let asaasCustomerId = '';
      let asaasPaymentId = '';
      let coraInvoiceId = '';
      let coraInvoiceCode = '';
      let invoiceUrl = '';
      let pixQr = '';
      let pixPayload = '';

      if (isFreeRegistration) {
        console.log('[PublicForm] submit:free', { message: 'Inscrição gratuita - nenhuma cobrança criada.' });
      } else if (paymentProvider === 'cora') {
        const paymentReference = crypto.randomUUID();
        const coraRes = await fetch(`${workerUrl}/cora/invoices/pix`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            code: `mcu-${paymentReference}`,
            amount,
            dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
            description: `MCU Night Run 2026 - ${selectedCategoria}`,
            customer: {
              name: data.nome,
              email: data.email,
              document: data.cpf.replace(/\D/g, ''),
              phone: data.telefone.replace(/\D/g, ''),
              address: data.endereco,
            },
          }),
        });
        const cora = await coraRes.json();
        console.log('[PublicForm] cora:invoice', { status: coraRes.status, ok: coraRes.ok, cora });
        if (!coraRes.ok) throw new Error(cora.message || cora.error || cora.errors?.[0].message || 'Falha ao criar cobrança na Cora.');
        coraInvoiceId = cora.id || '';
        coraInvoiceCode = cora.code || '';
        paymentExternalId = coraInvoiceId || coraInvoiceCode;
        invoiceUrl = cora.invoiceUrl || '';
        pixPayload = cora.pixPayload || '';
        pixQr = pixPayload ? (await QRCode.toDataURL(pixPayload)).replace(/^data:image\/png;base64,/, '') : '';
      } else {
        const customerRes = await fetch(`${workerUrl}/asaas/customers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: data.nome,
            cpfCnpj: data.cpf.replace(/\D/g, ''),
            email: data.email,
            mobilePhone: data.telefone.replace(/\D/g, ''),
          }),
        });
        const customer = await customerRes.json();
        console.log('[PublicForm] asaas:customer', { status: customerRes.status, ok: customerRes.ok, customer });
        if (!customerRes.ok) throw new Error(customer.errors?.[0].description || 'Falha ao criar cliente no Asaas.');
        asaasCustomerId = customer.id || '';
        paymentCustomerId = asaasCustomerId;

        const paymentRes = await fetch(`${workerUrl}/asaas/payments`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer: asaasCustomerId,
            billingType: 'PIX',
            value: amount / 100,
            dueDate: new Date(Date.now() + 3 * 86400000).toISOString().split('T')[0],
            description: `MCU Night Run 2026 - ${selectedCategoria}`,
          }),
        });
        const payment = await paymentRes.json();
        console.log('[PublicForm] asaas:payment', { status: paymentRes.status, ok: paymentRes.ok, payment });
        if (!paymentRes.ok) throw new Error(payment.errors?.[0].description || 'Falha ao criar cobrança.');
        asaasPaymentId = payment.id || '';
        paymentExternalId = asaasPaymentId;
        invoiceUrl = payment.invoiceUrl || '';

        const qrRes = await fetch(`${workerUrl}/asaas/payments/${asaasPaymentId}/pixQrCode`);
        const qr = await qrRes.json();
        console.log('[PublicForm] asaas:pixQr', { status: qrRes.status, ok: qrRes.ok, hasQr: Boolean(qr.encodedImage), hasPayload: Boolean(qr.payload) });
        pixQr = qr.encodedImage || '';
        pixPayload = qr.payload || '';
      }

      let euVouCardUrl = '';
      if (data.fotoUrl) {
        try {
          console.log('[PublicForm] euVouCard:start', { fotoUrl: data.fotoUrl });
          euVouCardUrl = await generateEuVouCard(data.fotoUrl, selectedModalidadeNome || selectedCategoria, userAge <= 12);
          console.log('[PublicForm] euVouCard:done', { euVouCardUrl });
        } catch (error) {
          console.error('Erro ao gerar card Eu Vou:', error);
        }
      }

      const registrationData = {
        ...data,
        kit: activeKit?.id || data.kit,
        kitNome: activeKit?.nome || KITS[0]?.nome || '',
        kitPrecoForcado: !!activeKit?.precoForcado,
        kitPrecoForcadoValor: activeKit?.precoForcado ? activeKit.precoForcadoValor : null,
        responsavelNome: requiresResponsible ? data.responsavelNome.trim() : '',
        responsavelCpf: requiresResponsible ? data.responsavelCpf : '',
        servidorPublicoMunicipal: data.categoria === 'adulto' && data.servidorPublicoMunicipal,
        matriculaServidor: data.categoria === 'adulto' && data.servidorPublicoMunicipal ? data.matriculaServidor.trim() : '',
        pcd: data.categoria === 'adulto' && data.pcd,
        paymentStatus: isFreeRegistration ? 'pago' : 'pendente',
        gratuito: isFreeRegistration,
        tipoInscricao: isFreeRegistration ? 'gratuita' : 'paga',
        paymentConfirmedAt: isFreeRegistration ? serverTimestamp() : null,
        paymentProvider,
        paymentCustomerId,
        paymentExternalId,
        asaasCustomerId,
        asaasPaymentId,
        coraInvoiceId,
        coraInvoiceCode,
        invoiceUrl,
        pixQr,
        pixPayload,
        euVouCardUrl,
        modalidadeNome: selectedModalidadeNome,
        termos: true,
        aceitouTermosResponsabilidade: true,
        regulamentoAceito: true,
        regulamentoAceitoEm: new Date().toISOString(),
        contractStatus: 'pendente',
        amount,
        registrationAmount,
        paymentFee,
        originalAmount: registrationDiscount.originalAmount,
        loteIndex: registrationDiscount.loteIndex,
        descontoLote: registrationDiscount.loteDiscount.discountAmount > 0,
        valorDescontoLote: registrationDiscount.loteDiscount.discountAmount,
        descontoIdoso: registrationDiscount.isSenior,
        descontoPcd: registrationDiscount.isPcd,
        descontoServidorPublicoMunicipal: registrationDiscount.isMunicipalServer,
        descontoAplicado: registrationDiscount.discountLabel,
        couponId: couponDiscount?.id || '',
        couponCode: couponDiscount?.code || '',
        couponDiscountType: couponDiscount?.type || '',
        couponDiscountValue: couponDiscount?.value || 0,
        couponDiscountAmount: couponDiscount?.discountAmount || 0,
        descontoCupom: Boolean(couponDiscount?.discountAmount),
        idadeNoCadastro: userAge,
        createdAt: serverTimestamp(),
      };
      console.log('[PublicForm] firestore:addDoc:start', { asaasPaymentId, invoiceUrl, hasCard: Boolean(euVouCardUrl) });
      const docRef = await addDoc(collection(db, 'nightrun_registrations'), registrationData);
      console.log('[PublicForm] firestore:addDoc:done', { registrationId: docRef.id });

      const paymentPageUrl = `https://night-run-uba.web.app/inscricao/pagamento/${docRef.id}`;
      const whatsappSettingsSnap = await getDoc(doc(db, 'nightrun_settings', 'whatsapp_registration_notice'));
      const whatsappSettings = whatsappSettingsSnap.exists() ? whatsappSettingsSnap.data() : {};
      const noticePhone = whatsappSettings.registrationNoticePhone || '';
      if (whatsappSettings.receiveRegistrationNoticeEnabled && noticePhone) {
        const numbersSnap = await getDoc(doc(db, 'nightrun_settings', 'whatsapp_numbers_public'));
        const activeInstances = numbersSnap.exists() && Array.isArray(numbersSnap.data().instances)
          ? numbersSnap.data().instances.filter((item: any) => item?.active !== false && item?.instanceName)
          : [];
        const singleInstanceName = activeInstances.length === 1 ? String(activeInstances[0].instanceName).trim() : '';
        const noticeText = formatRegistrationNotice({
          registration: registrationData,
          amount,
          paymentPageUrl,
          categoriaNome: selectedCategoria,
          modalidadeNome: selectedModalidadeNome,
          camisetaLabel: selectedCamiseta?.label || data.tamanhoCamiseta || '-',
          invoiceUrl,
        });
        const noticePayload = {
          phone: normalizeWhatsAppPhone(noticePhone),
          text: noticeText,
          type: 'registration_notice',
          alunoNome: registrationData.nome,
          registrationId: docRef.id,
          instanceName: singleInstanceName || undefined,
        };
        const noticeRes = await fetch(`${workerUrl}/whatsapp/send`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(noticePayload),
        });
        const noticeBody = await noticeRes.json().catch(() => ({}));
        console.log('[PublicForm] whatsapp:notice:direct', { status: noticeRes.status, ok: noticeRes.ok, body: noticeBody });

        if (!noticeRes.ok || noticeBody.success === false) {
          await fetch(`${workerUrl}/queue/enqueue`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messages: [noticePayload],
          }),
          }).then(async res => console.log('[PublicForm] whatsapp:notice:queued', { status: res.status, ok: res.ok, body: await res.json().catch(() => ({})) }))
            .catch(error => console.error('Erro ao enfileirar aviso:', error));
        }
      }

      navigate(isFreeRegistration ? `/inscricao/confirmada/${docRef.id}` : `/inscricao/pagamento/${docRef.id}`);
    } catch (error: any) {
      console.error('[PublicForm] submit:error', error);
      showAlert(error.message || 'Erro ao finalizar inscrição.', 'error');
    } finally {
      setLoading(false);
    }
  };

  const goBack = () => {
    if (stage === 'review') setStage('form');
  };

  const goNext = () => {
    if (!stageValid) return;
    if (stage === 'form') {
      setShowSignatureModal(true);
      return;
    }
    else handleSubmit();
  };

  const acceptSignatureAndReview = () => {
    if (!signatureValid) {
      showAlert('Leia e aceite o regulamento e assine para continuar.', 'warning');
      return;
    }
    setShowSignatureModal(false);
    setStage('review');
  };

  const renderCamisetaCards = (tipo: string) => (
    availableCamisetas.filter(t => t.tipo === tipo).map(t => {
      const esgotado = (t.estoque || 0) <= 0;
      return (
        <button
          type="button"
          key={t.id}
          className={`single-size-option ${data.tamanhoCamiseta === t.id ? 'selected' : ''} ${esgotado ? 'disabled' : ''}`}
          onClick={() => !esgotado && set('tamanhoCamiseta', t.id)}
        >
          <strong>{t.label.includes(' - ') ? t.label.split(' - ')[1] : t.label}</strong>
          {t.medidas && <small>{t.medidas.largura} x {t.medidas.altura} cm</small>}
          {esgotado && <span>ESGOTADO</span>}
        </button>
      );
    })
  );

  const sizeTableOverlay = showSizeTable && (
    <div className="size-table-overlay" onClick={() => setShowSizeTable(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.9)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
      <img src={sizeTableImage} alt="Tabela de tamanhos" style={{ maxWidth: '100%', maxHeight: '90vh', objectFit: 'contain', borderRadius: 8 }} />
    </div>
  );

  return (
    <div className={`public-app-root pro-form-version continuous-form-version ${stage === 'form' && !data.categoria ? 'continuous-start' : ''}`}>
      {registrationsClosed && bypassClosedScreen && (
        <div style={{
          background: '#e0a800',
          color: '#000',
          textAlign: 'center',
          padding: '8px 16px',
          fontSize: '0.85rem',
          fontWeight: 'bold',
          position: 'sticky',
          top: 0,
          zIndex: 9999,
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          ⚠ Modo de visualização de testes ativo (Bypass Ctrl+Z). As inscrições estão FECHADAS para o público geral.
        </div>
      )}
      <LoadingModal isOpen={loading} message={loadingMessage} />
      {sizeTableOverlay}

      <main className="public-main-content single-form-main">
        <div className="single-form-shell">
          {data.categoria && (
            <header className="single-form-header">
              <img src="/logo-mcu.png" alt="Prefeitura de Manhuaçu" className="single-form-side-logo" />
              <img src="/LOGO NIGHT RUN SEM FUNDO (em amarelo).png" alt="MCU Night Run" className="single-form-main-logo" />
              <img src="/logo-ademare.png" alt="Ademare" className="single-form-side-logo" />
            </header>
          )}

          {stage === 'form' && (
            <>
              <section className={`single-form-section ${!data.categoria ? 'category-options-only' : ''}`}>
                {data.categoria && (
                  <>
                    <div className="single-section-heading single-heading-with-action">
                      <span>01</span>
                      <div>
                        <h2>Tipo de inscrição</h2>
                        <p>{selectedCategoria}</p>
                      </div>
                      <button type="button" className="single-change-button" onClick={() => setData((prev: any) => ({ ...prev, categoria: '', modalidadeId: '' }))}>Trocar</button>
                    </div>
                    {data.categoria === 'adulto' && (
                      <>
                      <div className="municipal-server-box">
                        <div>
                          <strong>Atleta PCD</strong>
                          <span>Pessoas com deficiência têm 50% de desconto.</span>
                          {data.pcd && <em>Documento comprobatório poderá ser solicitado na retirada do kit.</em>}
                        </div>
                        <div className="municipal-server-actions">
                          <button type="button" className={data.pcd ? 'active' : ''} onClick={() => set('pcd', true)}>Sim</button>
                          <button type="button" className={!data.pcd ? 'active' : ''} onClick={() => set('pcd', false)}>Não</button>
                        </div>
                      </div>
                      <div className="municipal-server-box">
                        <div>
                          <strong>Servidor público municipal</strong>
                          <span>Servidores da Prefeitura Municipal de Manhuaçu têm 20% de desconto.</span>
                          {data.servidorPublicoMunicipal && (
                            <>
                              <em>Servidor público deve apresentar o contracheque na retirada do kit. É obrigatório.</em>
                              <img className="municipal-server-example" src="/exemplo-contracheque.png" alt="Exemplo de contracheque" />
                              <div className="municipal-server-matricula">
                                <label>NÚMERO DA MATRÍCULA *</label>
                                <div className="pro-input-wrapper">
                                  <div className="pro-input-icon"><CreditCard size={20} /></div>
                                  <input
                                    value={data.matriculaServidor}
                                    onChange={e => set('matriculaServidor', e.target.value.replace(/\D/g, ''))}
                                    placeholder="Ex.: 103167"
                                    inputMode="numeric"
                                  />
                                </div>
                                <small>
                                  Use o número destacado no contracheque.{' '}
                                  <a href="https://gpi-services.cloud.el.com.br/mg-manhuacu-pm/portal/login" target="_blank" rel="noreferrer">
                                    Não sabe o seu
                                  </a>
                                </small>
                              </div>
                            </>
                          )}
                        </div>
                        <div className="municipal-server-actions">
                          <button type="button" className={data.servidorPublicoMunicipal ? 'active' : ''} onClick={() => set('servidorPublicoMunicipal', true)}>Sim</button>
                          <button type="button" className={!data.servidorPublicoMunicipal ? 'active' : ''} onClick={() => setData((prev: any) => ({ ...prev, servidorPublicoMunicipal: false, matriculaServidor: '' }))}>Não</button>
                        </div>
                      </div>
                      </>
                    )}
                  </>
                )}

                {!data.categoria && (
                  <>
                    <h1 className="athlete-profile-title">QUAL É O PERFIL DO ATLETA</h1>
                    <div className="intro-choice-grid single-category-grid">
                      <button type="button" className="intro-choice-card child" onClick={() => selectCategory('infantil')}>
                        <div className="intro-choice-icon"><Baby size={28} strokeWidth={2.5} /></div>
                        <div className="intro-choice-name">INFANTIL</div>
                        <div className="intro-choice-desc">Até 12 anos</div>
                        <div className="intro-choice-pill">COM RESPONSÁVEL</div>
                      </button>
                      <button type="button" className="intro-choice-card adult" onClick={() => selectCategory('adulto')}>
                        <div className="intro-choice-icon"><PersonStanding size={28} strokeWidth={2.5} /></div>
                        <div className="intro-choice-name">JUVENIL / ADULTO</div>
                        <div className="intro-choice-desc">A partir de 13 anos</div>
                      </button>
                    </div>
                  </>
                )}
              </section>

              {data.categoria && (
                <>
                  <section className="single-form-section">
                    <div className="single-section-heading">
                      <span>02</span>
                      <div>
                        <h2>Dados {isChildRegistration ? 'da criança' : 'do atleta'}</h2>
                        <p>Campos curtos ficam agrupados para reduzir a rolagem.</p>
                      </div>
                    </div>

                    <div className="single-field-grid tight">
                      <div className="pro-input-group">
                        <label>Nome completo *</label>
                        <div className="pro-input-wrapper"><div className="pro-input-icon"><User size={20} /></div><input ref={undefined} value={data.nome} onChange={e => set('nome', e.target.value)} /></div>
                      </div>
                      <div className="pro-input-group compact">
                        <label>CPF *</label>
                        <div className="pro-input-wrapper"><div className="pro-input-icon"><CreditCard size={20} /></div><input value={data.cpf} onChange={e => set('cpf', maskCPF(e.target.value))} placeholder="000.000.000-00" /></div>
                      </div>
                      <div className="pro-input-group compact mini">
                        <label>Nascimento *</label>
                        <div className="pro-input-wrapper"><input value={data.dataNascimento} onChange={e => set('dataNascimento', maskDate(e.target.value))} placeholder="dd/mm/aaaa" /></div>
                      </div>
                      {hasCompleteBirthDate && (
                        <div className="pro-input-group compact mini">
                          <label>Idade</label>
                          <div className="pro-input-wrapper"><input value={`${userAge} anos`} readOnly /></div>
                          {discountPreviewText && <small className="senior-benefit-note">{discountPreviewText}</small>}
                        </div>
                      )}
                    </div>
                    <h3 style={{ height: 1, margin: 0, overflow: 'hidden' }}>Dados pessoais</h3>

                    {hasCompleteBirthDate && !birthDateMatchesCategory && (
                      <p className="single-inline-alert">{isChildRegistration ? 'A inscrição infantil aceita apenas crianças de até 12 anos.' : 'Atletas de até 12 anos devem usar a inscrição infantil.'}</p>
                    )}

                    {requiresResponsible && (
                      <div className="single-field-grid responsible">
                        <div className="pro-input-group">
                          <label>Nome do responsável *</label>
                          <div className="pro-input-wrapper"><div className="pro-input-icon"><Users size={20} /></div><input value={data.responsavelNome} onChange={e => set('responsavelNome', e.target.value)} /></div>
                        </div>
                        <div className="pro-input-group compact">
                          <label>CPF do responsável *</label>
                          <div className="pro-input-wrapper"><div className="pro-input-icon"><CreditCard size={20} /></div><input value={data.responsavelCpf} onChange={e => set('responsavelCpf', maskCPF(e.target.value))} /></div>
                        </div>
                      </div>
                    )}

                    <div className="single-field-grid contact">
                      <div className="pro-input-group compact">
                        <label>Sexo *</label>
                        <div className="pro-input-wrapper">
                          <select value={data.sexo} onChange={e => set('sexo', e.target.value)}>
                            <option value="">Selecione</option>
                            <option value="M">Masculino</option>
                            <option value="F">Feminino</option>
                          </select>
                        </div>
                      </div>
                      <div className="pro-input-group compact">
                        <label>E-mail *</label>
                        <div className="pro-input-wrapper"><div className="pro-input-icon"><Mail size={20} /></div><input type="email" value={data.email} onChange={e => set('email', e.target.value)} /></div>
                      </div>
                      <div className="pro-input-group compact">
                        <label>WhatsApp *</label>
                        <div className="pro-input-wrapper"><div className="pro-input-icon"><Phone size={20} /></div><input value={data.telefone} onChange={e => set('telefone', maskPhone(e.target.value))} placeholder="(00) 00000-0000" /></div>
                      </div>
                    </div>

                    <div className="single-field-grid team">
                      <div className="pro-input-group compact mini">
                        <label>Integrante de alguma equipe</label>
                        <div className="pro-input-wrapper">
                          <select value={data.integranteEquipe} onChange={e => setData((prev: any) => ({ ...prev, integranteEquipe: e.target.value, equipeNome: e.target.value === 'sim' ? prev.equipeNome : '' }))}>
                            <option value="nao">Não</option>
                            <option value="sim">Sim</option>
                          </select>
                        </div>
                      </div>
                      {data.integranteEquipe === 'sim' && (
                        <div className="pro-input-group compact">
                          <label>Qual equipe *</label>
                          <div className="pro-input-wrapper"><div className="pro-input-icon"><Users size={20} /></div><input value={data.equipeNome} onChange={e => set('equipeNome', e.target.value)} /></div>
                        </div>
                      )}
                    </div>
                  </section>

                  <section className="single-form-section">
                    <div className="single-section-heading"><span>03</span><div><h2>Contato de emergência</h2><p>Usado apenas se a organização precisar falar com alguém.</p></div></div>
                    <div className="single-field-grid emergency">
                      <div className="pro-input-group"><label>Nome do contato *</label><div className="pro-input-wrapper"><div className="pro-input-icon"><Users size={20} /></div><input value={data.contatoEmergencia.nome} onChange={e => setContato('nome', e.target.value)} /></div></div>
                      <div className="pro-input-group compact"><label>Telefone *</label><div className="pro-input-wrapper"><div className="pro-input-icon"><Phone size={20} /></div><input value={data.contatoEmergencia.telefone} onChange={e => setContato('telefone', maskPhone(e.target.value))} /></div></div>
                      <div className="pro-input-group compact mini"><label>Parentesco</label><div className="pro-input-wrapper"><input value={data.contatoEmergencia.parentesco} onChange={e => setContato('parentesco', e.target.value)} /></div></div>
                    </div>
                  </section>

                  <section className="single-form-section">
                    <div className="single-section-heading"><span>04</span><div><h2>Prova, camiseta e foto</h2><p>A foto fica ao lado do kit para economizar espaço vertical.</p></div></div>
                    <div className="single-modality-area">
                      {data.categoria !== 'infantil' && (
                        <div className="form-group">
                          <label>Prova / distância *</label>
                          <div className="modality-grid single-modality-grid">
                            {adultModalities.map(mod => (
                              <button type="button" key={mod.id} className={`modality-card ${data.modalidadeId === mod.id ? 'selected' : ''}`} onClick={() => set('modalidadeId', mod.id)}>
                                <div className="mod-name">{mod.nome}</div>
                                {mod.distancia && <div className="mod-desc">{mod.distancia}</div>}
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                      {data.categoria === 'infantil' && hasCompleteBirthDate && (
                        matchingChildModalities.length > 0 ? (
                          <div className="form-group">
                            <label>Prova infantil *</label>
                            <div className="modality-grid single-modality-grid">
                              {matchingChildModalities.map(mod => (
                                <button
                                  type="button"
                                  key={mod.id}
                                  className={`modality-card ${data.modalidadeId === mod.id ? 'selected' : ''} ${autoLockedChildModalityId === mod.id ? 'locked' : ''}`}
                                  onClick={() => {
                                    if (autoLockedChildModalityId === mod.id) return;
                                    set('modalidadeId', mod.id);
                                  }}
                                  disabled={autoLockedChildModalityId === mod.id}
                                  aria-disabled={autoLockedChildModalityId === mod.id}
                                >
                                  <div className="mod-name">{mod.nome}</div>
                                  {mod.distancia && <div className="mod-desc">{mod.distancia}</div>}
                                </button>
                              ))}
                            </div>
                          </div>
                        ) : (
                          <div className="summary-box"><p>Nenhuma modalidade infantil cadastrada para {userAge} anos.</p></div>
                        )
                      )}
                    </div>
                    <div className="single-kit-photo-layout">
                      <div className="single-shirt-panel">
                        <div className="single-shirt-head"><div><label>Tamanho da camiseta *</label><strong>{selectedCamiseta?.label || 'Selecione o tamanho'}</strong></div></div>
                        <p className="single-shirt-disclaimer">* A camiseta não faz parte deste kit. Coletamos o tamanho para o caso de disponibilizarmos camisetas para venda futuramente.</p>
                        <div className="size-table-container" onClick={() => setShowSizeTable(true)} style={{ marginBottom: 16, borderRadius: 12, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)', cursor: 'zoom-in' }}>
                          <img src={sizeTableImage} alt="Tabela de tamanhos" style={{ width: '100%', display: 'block', height: 'auto' }} />
                          <div style={{ padding: 8, textAlign: 'center', fontSize: '0.7rem', color: '#6BFF2A', fontWeight: 600, background: 'rgba(0,0,0,0.3)' }}>CLIQUE PARA AMPLIAR</div>
                        </div>
                        <div className="single-size-group"><span>Padrão</span><div className="single-size-grid">{renderCamisetaCards('Padrão')}</div></div>
                        <div className="single-size-group"><span>Baby Look</span><div className="single-size-grid">{renderCamisetaCards('Baby Look')}</div></div>
                      </div>
                      <aside className={`single-photo-card ${data.fotoUrl ? 'has-photo' : ''}`}>
                        <div className="single-photo-title"><Camera size={20} /><span>Foto do atleta</span></div>
                        {data.fotoUrl ? (
                          <div className="single-photo-preview">
                            <img src={data.fotoUrl} alt="Preview" />
                            <label>Trocar foto<input type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} /></label>
                          </div>
                        ) : (
                          <label className="single-photo-drop"><Camera size={34} /><span>Enviar foto</span><input type="file" accept="image/*" onChange={handlePhoto} style={{ display: 'none' }} /></label>
                        )}
                      </aside>
                    </div>
                  </section>

                  <section className="single-form-section">
                    <div className="single-section-heading"><span>05</span><div><h2>Saúde</h2><p>Informações essenciais para a equipe do evento.</p></div></div>
                    <div className="single-field-grid health">
                      <div className="pro-input-group compact">
                        <label>Condição de saúde *</label>
                        <div className="pro-input-wrapper">
                          <select value={data.saude.condicaoSaude} onChange={e => setSaude('condicaoSaude', e.target.value)}>
                            <option value="">Selecione</option>
                            <option value="excelente">Excelente</option>
                            <option value="boa">Boa</option>
                            <option value="regular">Regular</option>
                          </select>
                        </div>
                      </div>
                      <div className="checkbox-option single-check" onClick={() => setSaude('temAlergia', !data.saude.temAlergia)}><span>{data.saude.temAlergia ? '✓' : '•'}</span> Possui alergia</div>
                      <div className="checkbox-option single-check" onClick={() => setSaude('tomaMedicamento', !data.saude.tomaMedicamento)}><span>{data.saude.tomaMedicamento ? '✓' : '•'}</span> Usa medicamento</div>
                    </div>
                    {data.saude.temAlergia && <div className="pro-input-group"><label>Descreva as alergias</label><textarea value={data.saude.alergiaDesc} onChange={e => setSaude('alergiaDesc', e.target.value)} /></div>}
                    {data.saude.tomaMedicamento && <div className="pro-input-group"><label>Descreva os medicamentos</label><textarea value={data.saude.medicamentoDesc} onChange={e => setSaude('medicamentoDesc', e.target.value)} /></div>}
                  </section>

                  <div className="single-completion-strip">
                    {[
                      ['Dados', personalValid],
                      ['Emergência', emergencyValid],
                      ['Prova', modalityValid],
                      ['Camiseta', shirtValid],
                      ['Foto', photoValid],
                      ['Saúde', healthValid],
                    ].map(([label, ok]) => (
                      <span key={String(label)} className={ok ? 'done' : ''}>{ok ? '✓' : '•'} {label}</span>
                    ))}
                  </div>
                </>
              )}
            </>
          )}

          {stage === 'review' && (
            <section className="single-confirm-layout-magistral">
              <div className="single-confirm-card-review">
                
                <div className="review-sheet-header">
                  <span className="review-badge-step">03</span>
                  <div className="review-sheet-title">
                    <h2>Ficha de Confirmação</h2>
                    <p>Revise todos os seus dados antes do pagamento</p>
                  </div>
                </div>

                <div className="review-athlete-profile-card">
                  <div className="review-avatar-container">
                    {data.fotoUrl ? (
                      <img src={data.fotoUrl} alt="Foto do atleta" className="review-avatar" />
                    ) : (
                      <div className="review-avatar-placeholder"><Camera size={32} /></div>
                    )}
                  </div>
                  <div className="review-identity-details">
                    <h3 className="review-athlete-name">{data.nome || '-'}</h3>
                    <div className="review-identity-badges">
                      <span className="badge-cat">{selectedCategoria}</span>
                      {data.sexo && <span className="badge-sex">{data.sexo === 'M' ? 'Masculino' : 'Feminino'}</span>}
                      {hasCompleteBirthDate && <span className="badge-age">{userAge} anos</span>}
                    </div>
                    <div className="review-inline-fields">
                      <div><span>CPF:</span> <strong>{data.cpf || '-'}</strong></div>
                      <div><span>Nasc.:</span> <strong>{data.dataNascimento || '-'}</strong></div>
                    </div>
                  </div>
                </div>

                <div className="review-details-grid">
                  
                  <div className="review-subcard">
                    <h4>Contato & Emergência</h4>
                    <div className="review-subcard-body">
                      <div className="review-field-inline"><span>WhatsApp:</span> <strong>{data.telefone || '-'}</strong></div>
                      <div className="review-field-inline"><span>E-mail:</span> <strong className="email-truncate">{data.email || '-'}</strong></div>
                      {requiresResponsible && (
                        <>
                          <div className="review-field-inline"><span>Responsável:</span> <strong>{data.responsavelNome || '-'}</strong></div>
                          <div className="review-field-inline"><span>CPF Resp.:</span> <strong>{data.responsavelCpf || '-'}</strong></div>
                        </>
                      )}
                      <div className="review-field-inline">
                        <span>Emergência:</span> 
                        <strong>
                          {data.contatoEmergencia.nome || '-'} 
                          {data.contatoEmergencia.telefone ? ` (${data.contatoEmergencia.telefone})` : ''}
                          {data.contatoEmergencia.parentesco ? ` - ${data.contatoEmergencia.parentesco}` : ''}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="review-subcard">
                    <h4>Opções da Corrida & Equipe</h4>
                    <div className="review-subcard-body">
                      <div className="review-field-inline"><span>Prova:</span> <strong className="text-highlight-green">{selectedModalidadeNome || '-'}</strong></div>
                      <div className="review-field-inline"><span>Camiseta:</span> <strong>{selectedCamisetaSummary}</strong></div>
                      <div className="review-field-inline"><span>PCD:</span> <strong className={data.pcd ? 'text-highlight-yellow' : ''}>{data.pcd ? 'Sim (50% de desconto)' : 'Não'}</strong></div>
                      <div className="review-field-inline"><span>Servidor Municipal:</span> <strong className={data.servidorPublicoMunicipal ? 'text-highlight-yellow' : ''}>{data.servidorPublicoMunicipal ? 'Sim (Apresentar Contracheque)' : 'Não'}</strong></div>
                      {data.servidorPublicoMunicipal && (
                        <div className="review-field-inline"><span>Matrícula:</span> <strong>{data.matriculaServidor || '-'}</strong></div>
                      )}
                      <div className="review-field-inline"><span>Equipe:</span> <strong>{data.integranteEquipe === 'sim' ? (data.equipeNome || 'Sim') : 'Não'}</strong></div>
                    </div>
                  </div>

                  <div className="review-subcard">
                    <h4>Saúde & Condições</h4>
                    <div className="review-subcard-body">
                      <div className="review-field-inline"><span>Estado Geral:</span> <strong className="capitalize">{data.saude.condicaoSaude || '-'}</strong></div>
                      <div className="review-field-inline">
                        <span>Possui Alergia:</span> 
                        <strong className={data.saude.temAlergia ? 'text-danger' : ''}>
                          {data.saude.temAlergia ? `Sim (${data.saude.alergiaDesc})` : 'Não'}
                        </strong>
                      </div>
                      <div className="review-field-inline">
                        <span>Usa Medicamento:</span> 
                        <strong className={data.saude.tomaMedicamento ? 'text-danger' : ''}>
                          {data.saude.tomaMedicamento ? `Sim (${data.saude.medicamentoDesc})` : 'Não'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="review-subcard review-signature-subcard">
                    <h4>Assinatura do Atleta</h4>
                    <div className="review-signature-body">
                      {data.assinatura ? (
                        <div className="review-signature-img-wrapper">
                          <img src={data.assinatura} alt="Assinatura Digital" className="review-signature-img" />
                        </div>
                      ) : (
                        <div className="review-signature-missing">Assinatura não encontrada</div>
                      )}
                      <div className="review-signature-caption">
                        <span>Assinatura digital registrada</span>
                      </div>
                    </div>
                  </div>

                </div>

                <div className="review-coupon-card">
                  <div className="review-coupon-heading">
                    <h4>Cupom de desconto</h4>
                    <span>{appliedCoupon ? 'Aplicado' : 'Opcional'}</span>
                  </div>
                  <div className="review-coupon-row">
                    <input
                      type="text"
                      value={couponCode}
                      onChange={event => {
                        setCouponCode(normalizeCouponCode(event.target.value));
                        setAppliedCoupon(null);
                        setCouponFeedback('');
                      }}
                      placeholder="DIGITE SEU CUPOM"
                    />
                    <button type="button" onClick={handleApplyCoupon} disabled={couponLoading || !couponCode.trim()}>
                      {couponLoading ? 'Validando...' : 'Aplicar'}
                    </button>
                  </div>
                  {(couponFeedback || appliedCoupon) && (
                    <p className={appliedCoupon ? 'coupon-feedback success' : 'coupon-feedback'}>
                      {couponFeedback || `Desconto de ${formatMoney(appliedCoupon?.discountAmount || 0)} aplicado.`}
                    </p>
                  )}
                </div>

                <div className="single-price-card-magistral">
                  <div className="price-label-side">
                    <span>Valor da Inscrição</span>
                    {discountPreviewText && <small className="discount-badge">{discountPreviewText}</small>}
                    {appliedCoupon && <small className="discount-badge">Cupom {appliedCoupon.code}: -{formatMoney(appliedCoupon.discountAmount)}</small>}
                  </div>
                  <div className="price-value-side">
                    <strong>{pricePreview !== null ? formatMoney(pricePreview) : 'Calculando...'}</strong>
                  </div>
                </div>

              </div>
            </section>
          )}
        </div>

      </main>

      {data.categoria && (
        <div className="continuous-action-bar">
          {stage !== 'form' && <button type="button" className="btn-pro-prev" onClick={goBack}>VOLTAR</button>}
          <button type="button" className="btn-pro-next" onClick={goNext} disabled={!stageValid} style={{ opacity: stageValid ? 1 : 0.5 }}>
            {nextLabel}
            <ArrowRight size={22} />
          </button>
        </div>
      )}

      {photoCrop && (
        <div className="photo-crop-overlay" role="dialog" aria-modal="true">
          <div className="photo-crop-modal">
            <div className="photo-crop-header">
              <div><span>Foto do atleta</span><h2>Ajuste o corte 1:1</h2></div>
              <button type="button" onClick={() => setPhotoCrop(null)}>×</button>
            </div>
            <div className="photo-crop-stage">
              <Cropper image={photoCrop.src} crop={crop} zoom={cropZoom} aspect={1} cropShape="rect" showGrid={false} onCropChange={setCrop} onZoomChange={setCropZoom} onCropComplete={onCropComplete} />
            </div>
            <div className="photo-crop-actions">
              <button type="button" onClick={() => setPhotoCrop(null)}>Cancelar</button>
              <button type="button" onClick={confirmPhotoCrop}>Usar foto</button>
            </div>
          </div>
        </div>
      )}

      {showSignatureModal && (
        <div className="terms-popup-overlay" role="dialog" aria-modal="true">
          <div className="terms-popup-modal">
            <div className="terms-popup-header">
              <span>Assinatura obrigatória</span>
              <h2>Leia, aceite e assine</h2>
            </div>
            <div className="terms-popup-confirm">
              <div className="terms-box terms-popup-text">
                <pre className="terms-regulation-text">{REGULAMENTO_OFICIAL}</pre>
              </div>
              <label className={`checkbox-option ${acceptedRegulation ? 'selected' : ''}`}>
                <input
                  type="checkbox"
                  checked={acceptedRegulation}
                  onChange={event => setAcceptedRegulation(event.target.checked)}
                />
                <span>{acceptedRegulation ? '✓' : '□'}</span>
                Li e aceito integralmente o Regulamento Oficial da MÇU Night Run 2026.
              </label>
              <div className="signature-zone terms-popup-signature">
                <label>Assinatura Digital *</label>
                <div className="sig-wrapper">
                  {!data.assinatura && <div className="sig-placeholder">Assine aqui</div>}
                  <SignatureCanvas ref={sigCanvas} canvasProps={{ className: 'sigCanvas' }} onEnd={() => set('assinatura', sigCanvas.current?.getCanvas().toDataURL('image/png') || '')} />
                </div>
                <button type="button" className="btn-clear-sig" onClick={() => { sigCanvas.current?.clear(); set('assinatura', ''); }}>Limpar</button>
              </div>
              <button type="button" className="btn-pro-next terms-popup-accept" onClick={acceptSignatureAndReview} disabled={!signatureValid} style={{ opacity: signatureValid ? 1 : 0.5 }}>
                ACEITAR E REVISAR
                <ArrowRight size={22} />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}

import { useState, useEffect } from 'react';
import { 
  ArrowRight, Package
} from 'lucide-react';
import * as Lucide from 'lucide-react';
import { collection, onSnapshot, query, limit } from 'firebase/firestore';
import { db } from '../../firebase';

interface KitModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStart: () => void;
  variant: 'modal' | 'section';
}

interface KitItem {
  id: string;
  nome: string;
  descricao: string;
  icone: string;
}

export const KitDrawer = ({ isOpen, onClose, onStart, variant = 'modal' }: KitModalProps) => {
  const [items, setItems] = useState<KitItem[]>([]);
  const isSection = variant === 'section';

  useEffect(() => {
    if (!isOpen && !isSection) return;
    const q = query(collection(db, 'nightrun_kit_items'), limit(20));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as KitItem));
      setItems(list);
    });
    return () => unsub();
  }, [isOpen, isSection]);

  const renderIcon = (name: string, size = 22) => {
    try {
      const IconComponent = (Lucide as any)[name];
      if (!IconComponent || (typeof IconComponent !== 'function' && !IconComponent.render)) {
        return <Lucide.Package size={size} strokeWidth={1.5} />;
      }
      return <IconComponent size={size} strokeWidth={1.5} />;
    } catch (e) {
      console.error('Erro no KitDrawer ao renderizar icone:', name, e);
      return <Lucide.Package size={size} strokeWidth={1.5} />;
    }
  };

  if (!isOpen) return null;

  if (isSection) {
    return (
      <section className="kit-page-section" aria-label="Kit do atleta">
        <div className="kit-modal-body kit-section-body">
          <div className="kit-inner-container">
            <div className="kit-main-display">
              <img src="/imagem_nova.jpeg" alt="Kit MCU Night Run" className="kit-image" />
            </div>

            <footer className="kit-modal-footer">
              <button className="kit-cta-button" onClick={onStart}>
                GARANTA SUA VAGA <ArrowRight size={20} />
              </button>
            </footer>
          </div>
        </div>
      </section>
    );
  }

  return (
    <div className="kit-modal-overlay" onClick={onClose}>
      <div className="kit-modal-content" onClick={e => e.stopPropagation()}>
        <div className="kit-modal-body">
          <div className="kit-inner-container">
            <div className="kit-main-display">
              <img src="/imagem_nova.jpeg" alt="Kit MCU Night Run" className="kit-image" />
            </div>

            <footer className="kit-modal-footer">
              <button className="kit-cta-button" onClick={onStart}>
                GARANTA SUA VAGA <ArrowRight size={20} />
              </button>
            </footer>
          </div>
        </div>
      </div>
    </div>
  );
};

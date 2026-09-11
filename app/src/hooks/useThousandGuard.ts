import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export const THOUSAND_THRESHOLD = 1000;

/**
 * Escuta ao vivo o contador de confirmados (nightrun_settings/confirmed_counter, mantido
 * pelo worker via increment atomico + recalibracao por cron). Assim que cruzar 1000, redireciona
 * na hora pra "/" - mesmo quem estiver no meio da inscrição, pagamento ou qualquer outra tela.
 * Usado nas páginas do funil público (Home, inscrição, pagamento, confirmação).
 *
 * `enabled` (default true) permite desligar o corte sem deixar de chamar o hook (regra dos
 * hooks) - usado em PaymentPage pra quem entrou pelo link secreto/VIP, que deve poder seguir
 * o pagamento até o fim mesmo depois do limite de 1000 baterem.
 */
export function useThousandGuard(onReached?: (count: number) => void, enabled: boolean = true) {
  const navigate = useNavigate();

  useEffect(() => {
    if (!enabled) return;
    const unsub = onSnapshot(doc(db, 'nightrun_settings', 'confirmed_counter'), snap => {
      const count = Number(snap.data()?.count ?? 0);
      if (count >= THOUSAND_THRESHOLD) {
        onReached?.(count);
        if (window.location.pathname !== '/') {
          navigate('/', { replace: true });
        }
      }
    }, error => console.error('[useThousandGuard] snapshot error', error));

    return () => unsub();
  }, [navigate, onReached, enabled]);
}

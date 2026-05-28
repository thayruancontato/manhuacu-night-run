import { FileEdit, Trash2 } from 'lucide-react';

interface AtletaQuickActionsProps {
  onEdit: () => void;
  onCancel: () => void;
}

export const AtletaQuickActions: React.FC<AtletaQuickActionsProps> = ({
  onEdit, onCancel
}) => {
  return (
    <div className="atleta-det-actions-row">
      <button className="action-btn-pill" onClick={onEdit}>
        <FileEdit size={16} />
        <span>Editar Dados</span>
      </button>
      <button className="action-btn-pill danger" onClick={onCancel}>
        <Trash2 size={16} />
        <span>Cancelar Inscrição</span>
      </button>
    </div>
  );
};

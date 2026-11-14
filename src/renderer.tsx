import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Button } from '@mui/material';
import {
  DndContext,
  DragEndEvent,
  useDraggable,
  useDroppable,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';

declare global {
  interface Window {
    airsiftAPI: any;
  }
}

interface UrlItem {
  id: number;
  url: string;
  title: string;
  status: 'inbox' | 'to_send' | 'archive';
  created_at: string;
}

const COLUMNS: { id: UrlItem['status']; title: string; color: string }[] = [
  { id: 'inbox', title: '📥 À trier (Inbox)', color: '#e3f2fd' },
  { id: 'to_send', title: '📶 Prêt à envoyer (Wi-Fi)', color: '#e8f5e9' },
  { id: 'archive', title: '📦 Archives', color: '#f5f5f5' },
];

// Carte URL déplaçable
function DraggableCard({ item, onDelete }: { item: UrlItem; onDelete: (id: number) => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
  });

  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
    opacity: isDragging ? 0.6 : 1,
    backgroundColor: '#ffffff',
    padding: '12px',
    borderRadius: '8px',
    boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
    marginBottom: '10px',
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    cursor: 'grab',
    wordBreak: 'break-all',
    gap: '8px',
  };

  return (
    <div ref={setNodeRef} style={style} {...listeners} {...attributes}>
      <span style={{ fontSize: '14px', fontFamily: 'sans-serif', color: '#333' }}>
        {item.url}
      </span>
      <button
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onDelete(item.id)}
        title="Supprimer"
        style={{
          border: 'none',
          background: 'transparent',
          color: '#d32f2f',
          cursor: 'pointer',
          fontWeight: 'bold',
          fontSize: '16px',
          padding: '4px 8px',
        }}
      >
        ×
      </button>
    </div>
  );
}

// Colonne de réception
function DroppableColumn({
  id,
  title,
  color,
  items,
  onDelete,
}: {
  id: UrlItem['status'];
  title: string;
  color: string;
  items: UrlItem[];
  onDelete: (id: number) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        flex: 1,
        backgroundColor: isOver ? '#d1e9fc' : color,
        borderRadius: '12px',
        padding: '16px',
        minHeight: '420px',
        transition: 'background-color 0.2s ease',
        border: isOver ? '2px dashed #1976d2' : '2px solid transparent',
      }}
    >
      <h2 style={{ fontSize: '16px', fontFamily: 'sans-serif', marginTop: 0, marginBottom: '16px', color: '#1a1a1a' }}>
        {title} ({items.length})
      </h2>
      {items.map((item) => (
        <DraggableCard key={item.id} item={item} onDelete={onDelete} />
      ))}
    </div>
  );
}

function App() {
  const [urls, setUrls] = useState<UrlItem[]>([]);
  const [input, setInput] = useState('');

  // États pour le chiffrement et le partage Wi-Fi
  const [pinCode, setPinCode] = useState('1234');
  const [wifiStatus, setWifiStatus] = useState<string>('');
  const [wifiError, setWifiError] = useState<string>('');
  const [isSharing, setIsSharing] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const loadUrls = async () => {
    const data = await window.airsiftAPI.getAllUrls();
    setUrls(data);
  };

  useEffect(() => {
    loadUrls();
  }, []);

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await window.airsiftAPI.addUrl(input.trim());
    setInput('');
    loadUrls();
  };

  const handleDelete = async (id: number) => {
    await window.airsiftAPI.deleteUrl(id);
    loadUrls();
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over) return;

    const urlId = Number(active.id);
    const newStatus = over.id as UrlItem['status'];

    const currentItem = urls.find((u) => u.id === urlId);
    if (!currentItem || currentItem.status === newStatus) return;

    setUrls((prev) =>
      prev.map((item) => (item.id === urlId ? { ...item, status: newStatus } : item))
    );
    await window.airsiftAPI.updateUrlStatus(urlId, newStatus);
  };

  // Lancement du chiffrement JSON et du serveur Wi-Fi local
  const handleStartShare = async () => {
    setWifiError('');
    setWifiStatus('');
    if (!pinCode.trim()) {
      setWifiError('Veuillez saisir un code PIN de chiffrement.');
      return;
    }

    try {
      const result = await window.airsiftAPI.sendReadyUrlsBluetooth(pinCode.trim());
      setWifiStatus(result.statusMessage);
      setIsSharing(true);
    } catch (err: any) {
      setWifiError(err.message || 'Erreur lors du démarrage du partage Wi-Fi.');
      setIsSharing(false);
    }
  };

  // Arrêt du partage Wi-Fi
  const handleStopShare = async () => {
    await window.airsiftAPI.stopBluetooth();
    setIsSharing(false);
    setWifiStatus('Partage Wi-Fi arrêté.');
  };

  const readyCount = urls.filter((u) => u.status === 'to_send').length;

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '24px', marginTop: 0 }}>
        Airsift
      </h1>

      {/* Formulaire d'ajout d'URL */}
      <form onSubmit={handleAdd} style={{ display: 'flex', gap: '12px', marginBottom: '24px' }}>
        <input
          type="text"
          placeholder="Coller une URL..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          style={{
            flex: 1,
            padding: '12px 16px',
            fontSize: '16px',
            borderRadius: '8px',
            border: '1px solid #ccc',
          }}
        />
        <Button variant="contained" type="submit" sx={{ px: 4, borderRadius: '8px' }}>
          Ajouter
        </Button>
      </form>

      {/* Barre de chiffrement et transfert Wi-Fi */}
      <div
        style={{
          backgroundColor: '#f0f7ff',
          border: '1px solid #bbdefb',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '28px',
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#0d47a1' }}>
            🔒 Code PIN AES-256 :
          </label>
          <input
            type="password"
            value={pinCode}
            onChange={(e) => setPinCode(e.target.value)}
            placeholder="Code PIN"
            style={{
              width: '120px',
              padding: '8px 12px',
              fontSize: '14px',
              borderRadius: '6px',
              border: '1px solid #90caf9',
            }}
          />
          <span style={{ fontSize: '13px', color: '#555' }}>
            ({readyCount} {readyCount > 1 ? 'liens prêts' : 'lien prêt'})
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {!isSharing ? (
            <Button
              variant="contained"
              color="success"
              onClick={handleStartShare}
              disabled={readyCount === 0}
              sx={{ borderRadius: '8px', fontWeight: 'bold' }}
            >
              📶 Partager en Wi-Fi
            </Button>
          ) : (
            <Button
              variant="outlined"
              color="error"
              onClick={handleStopShare}
              sx={{ borderRadius: '8px', fontWeight: 'bold' }}
            >
              ⏹ Arrêter le partage Wi-Fi
            </Button>
          )}
        </div>

        {/* Messages d'état ou d'erreur Wi-Fi */}
        {wifiStatus && (
          <div style={{ width: '100%', fontSize: '13px', color: '#2e7d32', fontWeight: 'bold' }}>
            ✅ {wifiStatus}
          </div>
        )}
        {wifiError && (
          <div style={{ width: '100%', fontSize: '13px', color: '#d32f2f', fontWeight: 'bold' }}>
            ⚠️ {wifiError}
          </div>
        )}
      </div>

      {/* Tableau Kanban 3 colonnes */}
      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.id}
              id={col.id}
              title={col.title}
              color={col.color}
              items={urls.filter((u) => u.status === col.id)}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}

const root = createRoot(document.getElementById('root')!);
root.render(<App />);

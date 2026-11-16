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
  status: 'inbox' | 'to_send' | 'sent' | 'archive'; // <-- Ajout de 'sent'
  room_id?: string | null;
  created_at: string;
}
interface RoomItem {
  id: number;
  name: string;
  room_id: string;
  secret_key: string;
  full_url: string;
}

const COLUMNS: { id: UrlItem['status']; title: string; color: string }[] = [
  { id: 'inbox', title: '📥 À trier (Inbox)', color: '#e3f2fd' },
  { id: 'to_send', title: '🚀 Prêt à envoyer', color: '#e8f5e9' },
  { id: 'sent', title: '📤 Envoyé', color: '#f3e5f5' }, // <-- Nouvelle colonne violet pâle
  { id: 'archive', title: '📦 Archives', color: '#f5f5f5' },
];

function DraggableCard({
  item,
  senderName,
  onDelete,
}: {
  item: UrlItem;
  senderName?: string;
  onDelete: (id: number) => void;
}) {
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        <span style={{ fontSize: '14px', fontFamily: 'sans-serif', color: '#333' }}>
          {item.url}
        </span>
        {senderName && (
          <span
            style={{
              fontSize: '11px',
              backgroundColor: '#e0f2fe',
              color: '#0369a1',
              padding: '2px 6px',
              borderRadius: '4px',
              alignSelf: 'flex-start',
              fontWeight: 'bold',
            }}
          >
            📲 Reçu de {senderName}
          </span>
        )}
      </div>
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
function DroppableColumn({
  id,
  title,
  color,
  items,
  rooms,
  onDelete,
}: {
  id: UrlItem['status'];
  title: string;
  color: string;
  items: UrlItem[];
  rooms: RoomItem[];
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
      {items.map((item) => {
        const sender = item.room_id ? rooms.find((r) => r.room_id === item.room_id)?.name : undefined;
        return <DraggableCard key={item.id} item={item} senderName={sender} onDelete={onDelete} />;
      })}
    </div>
  );
}

function App() {
  const [urls, setUrls] = useState<UrlItem[]>([]);
  const [rooms, setRooms] = useState<RoomItem[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [input, setInput] = useState('');

  // États de notification et création de contact
  const [statusMsg, setStatusMsg] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [isAddingRoom, setIsAddingRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 5 },
    })
  );

  const loadData = async () => {
    const [urlsData, roomsData] = await Promise.all([
      window.airsiftAPI.getAllUrls(),
      window.airsiftAPI.getAllRooms(),
    ]);
    setUrls(urlsData);
    setRooms(roomsData);

    // Sélectionne automatiquement le 1er destinataire [0] si aucun n'est encore défini
    if (roomsData.length > 0 && !selectedRoomId) {
      setSelectedRoomId(roomsData[0].room_id);
    }
  };

  
  // Joue un double bip doux sans aucun fichier audio externe
  const playReceiveSound = () => {
    try {
      const ctx = new AudioContext();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, ctx.currentTime); // Note La5
      osc.frequency.setValueAtTime(1108.73, ctx.currentTime + 0.1); // Note Do#6
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    } catch {
      // Ignore si l'audio est bloqué
    }
  };

  useEffect(() => {
    loadData();

    const unsubscribe = window.airsiftAPI.onUrlsReceived((newItems: UrlItem[]) => {
      loadData();
      playReceiveSound();
      setErrorMsg('');
      const count = newItems?.length || 1;
      setStatusMsg(`🔔 ${count} ${count > 1 ? 'nouveaux liens reçus' : 'nouveau lien reçu'} dans "À trier" !`);
    });
    return () => unsubscribe();
  }, []);
  


  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim()) return;
    await window.airsiftAPI.addUrl(input.trim());
    setInput('');
    loadData();
  };
  const handleDelete = async (id: number) => {
    await window.airsiftAPI.deleteUrl(id);
    loadData();
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
  

  const handleSendCloud = async () => {
    setErrorMsg('');
    setStatusMsg('');

    const targetId = selectedRoomId || (rooms.length > 0 ? rooms[0].room_id : '');
    if (!targetId) {
      setErrorMsg('Veuillez sélectionner un destinataire.');
      return;
    }

    // On mémorise le nombre de liens prêts avant l'envoi
    const countToSend = readyCount;

    try {
      const result = await window.airsiftAPI.sendReadyUrlsCloud(targetId);
      if (result.success) {
        const targetRoom = rooms.find((r) => r.room_id === targetId);
        await loadData();
        const label = countToSend > 1 ? 'Liens chiffrés envoyés' : 'Lien chiffré envoyé';
        setStatusMsg(`✅ ${label} vers ${targetRoom?.name || 'le relais'} !`);
      } else {
        setErrorMsg(result.error || "Erreur lors de l'envoi.");
      }
    } catch (err: any) {
      setErrorMsg(err.message || "Aucun lien prêt à envoyer.");
    }
  };


  const handleCopySecretLink = () => {
    const currentRoom = rooms.find((r) => r.room_id === selectedRoomId);
    if (!currentRoom) return;
    navigator.clipboard.writeText(currentRoom.full_url);
    setErrorMsg('');
    setStatusMsg(`📋 Lien secret de "${currentRoom.name}" copié ! Ouvrez-le dans Safari sur iPhone.`);
  };
  const handleCreateRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRoomName.trim()) return;
    const newRoom = await window.airsiftAPI.createRoom(newRoomName.trim());
    await loadData();
    setSelectedRoomId(newRoom.room_id);
    setNewRoomName('');
    setIsAddingRoom(false);
    setStatusMsg(`✨ Salle "${newRoom.name}" créée !`);
  };

  const handleDeleteRoom = async () => {
    const currentRoom = rooms.find((r) => r.room_id === selectedRoomId);
    if (!currentRoom) return;

    await window.airsiftAPI.deleteRoom(currentRoom.id);
    const updatedRooms = await window.airsiftAPI.getAllRooms();
    setRooms(updatedRooms);
    setSelectedRoomId(updatedRooms.length > 0 ? updatedRooms[0].room_id : '');
    setErrorMsg('');
    setStatusMsg(`🗑️ Contact "${currentRoom.name}" supprimé.`);
  };


  const readyCount = urls.filter((u) => u.status === 'to_send').length;
  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '32px 24px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 'bold', marginBottom: '24px', marginTop: 0 }}>
        Hare Sync
      </h1>

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
      <div
        style={{
          backgroundColor: '#f0f7ff',
          border: '1px solid #bbdefb',
          borderRadius: '12px',
          padding: '16px 20px',
          marginBottom: '28px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <label style={{ fontWeight: 'bold', fontSize: '14px', color: '#0d47a1' }}>
              🔒 Destinataire :
            </label>
            <select
              value={selectedRoomId}
              onChange={(e) => setSelectedRoomId(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '14px',
                borderRadius: '6px',
                border: '1px solid #90caf9',
                backgroundColor: '#fff',
                fontWeight: 'bold',
              }}
            >
              {rooms.map((room) => (
                <option key={room.room_id} value={room.room_id}>
                  {room.name}
                </option>
              ))}
            </select>

            {rooms.length > 0 && (
              <Button
                variant="text"
                color="error"
                size="small"
                onClick={handleDeleteRoom}
                title="Supprimer ce destinataire"
                sx={{ minWidth: 'auto', px: 1 }}
              >
                🗑️
              </Button>
            )}

            <Button
              variant="outlined"
              size="small"
              onClick={handleCopySecretLink}
              title="Copier l'URL secrète avec clé intégrée pour Safari iOS"
            >
              🔗 Copier le lien secret
            </Button>

            {!isAddingRoom ? (
              <Button
                variant="text"
                size="small"
                onClick={() => setIsAddingRoom(true)}
                title="Ajouter un nouvel appareil ou correspondant"
              >
                + Nouveau contact
              </Button>
            ) : (
              <form
                onSubmit={handleCreateRoom}
                style={{ display: 'flex', gap: '6px', alignItems: 'center' }}
              >
                <input
                  type="text"
                  placeholder="Nom (ex: iPhone)"
                  value={newRoomName}
                  onChange={(e) => setNewRoomName(e.target.value)}
                  autoFocus
                  style={{
                    padding: '6px 10px',
                    fontSize: '13px',
                    borderRadius: '6px',
                    border: '1px solid #90caf9',
                    backgroundColor: '#fff',
                  }}
                />
                <Button type="submit" variant="contained" size="small">
                  OK
                </Button>
                <Button
                  type="button"
                  variant="text"
                  size="small"
                  onClick={() => {
                    setIsAddingRoom(false);
                    setNewRoomName('');
                  }}
                >
                  Annuler
                </Button>
              </form>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontSize: '13px', color: '#555' }}>
              ({readyCount} {readyCount > 1 ? 'liens prêts' : 'lien prêt'})
            </span>
            <Button
              variant="contained"
              color="success"
              onClick={handleSendCloud}
              disabled={readyCount === 0}
              sx={{ fontWeight: 'bold' }}
            >
              🚀 Envoyer ({readyCount})
            </Button>
          </div>
        </div>

        {statusMsg && (
          <div style={{ fontSize: '13px', color: '#1b5e20', fontWeight: 'bold' }}>{statusMsg}</div>
        )}
        {errorMsg && (
          <div style={{ fontSize: '13px', color: '#c62828', fontWeight: 'bold' }}>⚠️ {errorMsg}</div>
        )}
      </div>

      <DndContext sensors={sensors} onDragEnd={handleDragEnd}>
        <div style={{ display: 'flex', gap: '20px', alignItems: 'flex-start' }}>
          {COLUMNS.map((col) => (
            <DroppableColumn
              key={col.id}
              id={col.id}
              title={col.title}
              color={col.color}
              items={urls.filter((u) => u.status === col.id)}
              rooms={rooms}
              onDelete={handleDelete}
            />
          ))}
        </div>
      </DndContext>
    </div>
  );
}
const rootElement = document.getElementById('root');
if (rootElement) {
  createRoot(rootElement).render(<App />);
}
